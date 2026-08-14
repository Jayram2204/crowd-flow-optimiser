"""Adversarial stress and edge case test suite for AI Telemetry.
Created by challenger_1 to rigorously test failure modes and boundary conditions.
"""
import asyncio
from unittest.mock import patch, MagicMock
import httpx
import pytest

from app.core.config import DEFAULT_ZONES, settings
import app.services.simulator as simulator
from app.services.density import DensityEstimator, VenueScenario
from app.services.simulator import _build_batch, run_forever


def test_adversarial_venue_scenario_empty_topology():
    """Verify VenueScenario behavior when initialized with zero zones."""
    scenario = VenueScenario({})
    assert len(scenario.zones) == 0
    ticks = scenario.tick()
    assert ticks == []


def test_adversarial_venue_scenario_extreme_capacities():
    """Verify VenueScenario numerical stability with massive and fractional capacities."""
    extreme_zones = {
        "MASSIVE_ZONE": (10_000_000, 50_000.0),
        "TINY_ZONE": (1, 2.0),
        "ZERO_CAP_ZONE": (0, 10.0),
    }
    scenario = VenueScenario(extreme_zones)
    for _ in range(50):
        results = scenario.tick()
        for zid, occ, inflow, outflow in results:
            assert occ >= 0
            assert inflow >= 0.0
            assert outflow >= 0.0
            assert not isinstance(occ, float)


def test_adversarial_venue_scenario_long_run_divergence_check():
    """Verify that 2,000 continuous simulation steps do not encounter floating overflow or NaN."""
    scenario = VenueScenario(DEFAULT_ZONES)
    for i in range(2000):
        results = scenario.tick()
        for zid, occ, inflow, outflow in results:
            assert occ >= 0, f"Negative occupancy at tick {i} for {zid}"
            assert inflow >= 0.0, f"Negative inflow at tick {i} for {zid}"
            assert outflow >= 0.0, f"Negative outflow at tick {i} for {zid}"


@pytest.mark.asyncio
async def test_adversarial_run_forever_cancellation_during_slow_network(monkeypatch):
    """Verify clean cancellation when backend network hangs indefinitely."""
    monkeypatch.setattr(simulator, "_frames", 0)
    estimator = DensityEstimator("simulated", "yolo11n")

    started_post = asyncio.Event()

    async def hanging_post(self, url, **kwargs):
        started_post.set()
        await asyncio.sleep(100.0)  # simulate stuck TCP socket
        return httpx.Response(200)

    with patch.object(httpx.AsyncClient, "post", hanging_post):
        task = asyncio.create_task(run_forever(estimator))
        await started_post.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert task.cancelled()


@pytest.mark.asyncio
async def test_adversarial_run_forever_resilience_to_consecutive_catastrophic_errors(monkeypatch):
    """Verify that loop survives 50 consecutive HTTP exceptions and server drops."""
    monkeypatch.setattr(simulator, "_frames", 0)
    monkeypatch.setattr(settings, "sim_loop_seconds", 0.001)
    estimator = DensityEstimator("simulated", "yolo11n")

    error_types = [
        httpx.ConnectError("Connection refused"),
        httpx.ConnectTimeout("Connect timeout"),
        httpx.ReadTimeout("Read timeout"),
        httpx.PoolTimeout("Pool timeout"),
        httpx.RemoteProtocolError("Remote protocol error"),
        httpx.UnsupportedProtocol("Unsupported protocol"),
        httpx.DecodingError("Decoding error"),
    ]
    error_idx = 0
    attempts = 0

    async def throwing_post(self, url, **kwargs):
        nonlocal error_idx, attempts
        attempts += 1
        err = error_types[error_idx % len(error_types)]
        error_idx += 1
        raise err

    with patch.object(httpx.AsyncClient, "post", throwing_post):
        task = asyncio.create_task(run_forever(estimator))
        for _ in range(50):
            if attempts >= 25:
                break
            await asyncio.sleep(0.01)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    assert attempts >= 25, f"Expected at least 25 recovery attempts, got {attempts}"


@pytest.mark.asyncio
async def test_adversarial_run_forever_all_http_error_status_codes(monkeypatch):
    """Verify loop handles status codes 400, 401, 403, 404, 422, 500, 502, 503, 504 without terminating."""
    monkeypatch.setattr(simulator, "_frames", 0)
    monkeypatch.setattr(settings, "sim_loop_seconds", 0.001)
    estimator = DensityEstimator("simulated", "yolo11n")

    status_codes = [400, 401, 403, 404, 422, 500, 502, 503, 504]
    seen_codes = []

    async def status_post(self, url, **kwargs):
        if not status_codes:
            return httpx.Response(202, json={"status": "ingested"})
        code = status_codes.pop(0)
        seen_codes.append(code)
        return httpx.Response(code, text=f"Error {code}")

    with patch.object(httpx.AsyncClient, "post", status_post):
        task = asyncio.create_task(run_forever(estimator))
        for _ in range(50):
            if len(seen_codes) >= 9:
                break
            await asyncio.sleep(0.01)
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    assert len(seen_codes) >= 9


# ============================================================================
# Telemetry CV Pipeline Edge Cases: Corrupt Images, Missing Weights, Empty Frames
# ============================================================================

def test_adversarial_corrupt_image_upload_empty_bytes():
    """Verify analyze-density handles 0-byte image payload gracefully."""
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/analyze-density?gate_id=GATE_A",
            files={"file": ("empty.jpg", b"", "image/jpeg")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["gate_id"] == "GATE_A"
        assert data["status"] == "success"
        assert data["estimated_density"] >= 0


def test_adversarial_corrupt_image_upload_random_binary_garbage():
    """Verify analyze-density handles arbitrary binary noise masquerading as image/jpeg."""
    from fastapi.testclient import TestClient
    from app.main import app

    garbage = bytes([i % 256 for i in range(4096)])
    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/analyze-density?gate_id=GATE_B",
            files={"file": ("corrupt.jpg", garbage, "image/jpeg")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["gate_id"] == "GATE_B"
        assert data["status"] == "success"


def test_adversarial_corrupt_image_upload_truncated_header():
    """Verify analyze-density handles truncated JPEG header bytes."""
    from fastapi.testclient import TestClient
    from app.main import app

    truncated_header = b"\xFF\xD8\xFF"
    with TestClient(app) as client:
        resp = client.post(
            "/api/v1/analyze-density?gate_id=E_PIER",
            files={"file": ("truncated.jpg", truncated_header, "image/jpeg")},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["gate_id"] == "E_PIER"
        assert data["status"] == "success"


def test_adversarial_missing_weights_fallback_chain(monkeypatch):
    """Verify that completely nonexistent weights gracefully degrade from YOLO -> Transformers -> Simulated."""
    monkeypatch.setattr("time.sleep", lambda _: None)
    import types
    import sys
    import transformers

    # Force YOLO failure
    mod = types.ModuleType("ultralytics")
    mod.YOLO = lambda _path: (_ for _ in ()).throw(FileNotFoundError("Weights not found on disk or Hub"))
    monkeypatch.setitem(sys.modules, "ultralytics", mod)

    # Force Transformers failure
    def fake_transformers_fail(*_a, **_k):
        raise ConnectionError("HuggingFace Hub unreachable / model id invalid")

    monkeypatch.setattr(transformers, "pipeline", fake_transformers_fail)

    estimator = DensityEstimator("live", "nonexistent_model_id_99999")
    assert estimator.mode == "simulated"
    assert estimator._pipeline is None

    density, occ = estimator.estimate("cctv:99", "GATE_A", 40)
    assert occ >= 0
    assert density >= 0.0


def test_adversarial_corrupted_local_weights_file(monkeypatch, tmp_path):
    """Verify corrupted local .pt weight file is caught and handled safely."""
    monkeypatch.setattr("time.sleep", lambda _: None)
    corrupted_weights = tmp_path / "weights"
    corrupted_weights.mkdir()
    (corrupted_weights / "yolo11n.pt").write_bytes(b"corrupted binary header not a torch zip archive")
    monkeypatch.setattr(settings, "weights_dir", str(corrupted_weights))

    # Should attempt local weights, fail to parse, try transformers, and degrade cleanly
    import transformers
    def fake_transformers_fail(*_a, **_k):
        raise RuntimeError("No network connection")
    monkeypatch.setattr(transformers, "pipeline", fake_transformers_fail)

    estimator = DensityEstimator("live", "yolo11n")
    assert estimator.mode == "simulated"
    assert estimator._pipeline is None

    density, occ = estimator.estimate("cctv:1", "GATE_A", 50)
    assert occ >= 0
    assert density >= 0.0


def test_adversarial_empty_frames_dir_fallback(monkeypatch, tmp_path):
    """Verify live mode with empty frames directory safely falls back to simulated estimation."""
    monkeypatch.setattr("time.sleep", lambda _: None)
    empty_dir = tmp_path / "empty_dir"
    empty_dir.mkdir()
    monkeypatch.setattr(settings, "frames_dir", str(empty_dir))

    estimator = DensityEstimator("live", "yolo11n")
    assert len(estimator._frames) == 0

    density, occ = estimator.estimate("cctv:1", "GATE_A", occupancy_hint=75)
    assert occ >= 0
    assert density >= 0.0


def test_adversarial_nonexistent_frames_dir_fallback(monkeypatch):
    """Verify live mode with non-existent frames directory path does not raise FileNotFoundError."""
    monkeypatch.setattr("time.sleep", lambda _: None)
    monkeypatch.setattr(settings, "frames_dir", "/tmp/nonexistent_frames_path_404_not_found")

    estimator = DensityEstimator("live", "yolo11n")
    assert len(estimator._frames) == 0

    density, occ = estimator.estimate("cctv:1", "GATE_B", occupancy_hint=50)
    assert occ >= 0
    assert density >= 0.0


def test_adversarial_frames_dir_with_unsupported_extensions_only(monkeypatch, tmp_path):
    """Verify frames directory with non-image files (.txt, .mp4, .csv) filters out files and falls back safely."""
    monkeypatch.setattr("time.sleep", lambda _: None)
    mixed_dir = tmp_path / "mixed_files"
    mixed_dir.mkdir()
    (mixed_dir / "notes.txt").write_text("not an image")
    (mixed_dir / "stream.mp4").write_bytes(b"fake video")
    (mixed_dir / "data.csv").write_text("a,b,c\n1,2,3")
    monkeypatch.setattr(settings, "frames_dir", str(mixed_dir))

    estimator = DensityEstimator("live", "yolo11n")
    assert len(estimator._frames) == 0

    density, occ = estimator.estimate("cctv:1", "GATE_A", occupancy_hint=30)
    assert occ >= 0
    assert density >= 0.0

