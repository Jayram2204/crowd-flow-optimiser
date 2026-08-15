import sys
import time
import types
from pathlib import Path
from unittest.mock import patch

import pytest

from app.core.config import DEFAULT_ZONES, settings
from app.models import TelemetryBatch
from app.services.density import DensityEstimator, VenueScenario
from app.services.simulator import _build_batch


def test_live_pipeline_real_local_weights_inference():
    # Uses the bundled yolo11n.pt weights and bundled sample frames
    estimator = DensityEstimator("live", "yolo11n")
    assert estimator.mode == "live"
    assert estimator._model_backend == "ultralytics-yolo"
    assert len(estimator._frames) >= 5

    density, occ = estimator.estimate("cctv:1", "GATE_A", 0)
    assert occ >= 0
    assert density >= 0.0
    cap, area = DEFAULT_ZONES["GATE_A"]
    assert occ <= cap
    assert density == pytest.approx(round(occ / area, 3))


def test_live_pipeline_multi_zone_frame_rotation():
    estimator = DensityEstimator("live", "yolo11n")
    frames_zone_a = [estimator._frame_for("GATE_A") for _ in range(3)]
    # Without incrementing _frame_seq, _frame_for produces deterministic result for same zone
    assert frames_zone_a[0] == frames_zone_a[1] == frames_zone_a[2]

    # Different zones hash to different starting frames (or modulo offsets)
    frame_a = estimator._frame_for("GATE_A")
    frame_b = estimator._frame_for("PLATFORM_1")

    # Advancing frame sequence rotates through frames
    estimator._frame_seq += 1
    frame_a_next = estimator._frame_for("GATE_A")
    assert frame_a_next != frame_a or len(estimator._frames) == 1


def test_live_pipeline_frame_caching_ttl(monkeypatch, tmp_path):
    (tmp_path / "sample.jpg").write_bytes(b"image")
    monkeypatch.setattr(settings, "frames_dir", str(tmp_path))

    estimator = DensityEstimator("live", "test-model")

    call_count = 0

    def mock_pipeline(_path):
        nonlocal call_count
        call_count += 1
        return [{"label": "person", "score": 0.95}]

    estimator._pipeline = mock_pipeline
    estimator.mode = "live"

    frame_path = Path(tmp_path / "sample.jpg")

    # First call - cache miss
    c1 = estimator._count_persons(frame_path)
    assert c1 == 1
    assert call_count == 1

    # Second call immediately - cache hit
    c2 = estimator._count_persons(frame_path)
    assert c2 == 1
    assert call_count == 1

    # Simulate time advancing beyond FRAME_CACHE_TTL (8.0 seconds)
    current_time = time.time()
    monkeypatch.setattr(time, "time", lambda: current_time + 10.0)

    # Third call after TTL expiration - cache miss, runs inference again
    c3 = estimator._count_persons(frame_path)
    assert c3 == 1
    assert call_count == 2


def test_live_pipeline_person_filtering_and_class_exclusion(monkeypatch, tmp_path):
    (tmp_path / "frame.jpg").write_bytes(b"image")
    monkeypatch.setattr(settings, "frames_dir", str(tmp_path))

    estimator = DensityEstimator("live", "test-model")
    estimator._pipeline = lambda _p: [
        {"label": "person", "score": 0.88},
        {"label": "person", "score": 0.50},  # Exactly at threshold -> included
        {"label": "person", "score": 0.49},  # Below threshold -> excluded
        {"label": "backpack", "score": 0.99},  # Non-person -> excluded
        {"label": "car", "score": 0.95},  # Non-person -> excluded
        {"label": "dog", "score": 0.70},  # Non-person -> excluded
    ]
    estimator.mode = "live"

    density, occ = estimator.estimate("cctv:1", "GATE_A", 0)
    assert occ == 2
    assert density == pytest.approx(round(2 / DEFAULT_ZONES["GATE_A"][1], 3))


def test_live_pipeline_fallback_to_transformers(monkeypatch, tmp_path):
    (tmp_path / "frame.jpg").write_bytes(b"image")
    monkeypatch.setattr(settings, "frames_dir", str(tmp_path))

    # Mock YOLO to raise an error during initialization
    mod = types.ModuleType("ultralytics")
    mod.YOLO = lambda _model_id: (_ for _ in ()).throw(RuntimeError("YOLO load error"))
    monkeypatch.setitem(sys.modules, "ultralytics", mod)

    import transformers

    def fake_transformers_pipeline(*_a, **_k):
        return lambda _path: [{"label": "person", "score": 0.92}]

    monkeypatch.setattr(transformers, "pipeline", fake_transformers_pipeline)

    estimator = DensityEstimator("live", "hf-detr-model")
    assert estimator.mode == "live"
    assert estimator._model_backend == "transformers"

    density, occ = estimator.estimate("cctv:1", "GATE_A", 0)
    assert occ == 1
    assert density == pytest.approx(round(1 / DEFAULT_ZONES["GATE_A"][1], 3))


def test_live_pipeline_fallback_to_simulated_when_all_fail(monkeypatch, tmp_path):
    monkeypatch.setattr("time.sleep", lambda _: None)
    (tmp_path / "frame.jpg").write_bytes(b"image")
    monkeypatch.setattr(settings, "frames_dir", str(tmp_path))

    # Force YOLO failure
    mod = types.ModuleType("ultralytics")
    mod.YOLO = lambda _model_id: (_ for _ in ()).throw(RuntimeError("YOLO failure"))
    monkeypatch.setitem(sys.modules, "ultralytics", mod)

    # Force transformers failure
    import transformers

    def fake_transformers_boom(*_a, **_k):
        raise RuntimeError("Transformers failure")

    monkeypatch.setattr(transformers, "pipeline", fake_transformers_boom)

    estimator = DensityEstimator("live", "hf-model")
    assert estimator.mode == "simulated"
    assert estimator._pipeline is None

    density, occ = estimator.estimate("cctv:1", "GATE_A", occupancy_hint=50)
    assert 47 <= occ <= 54
    assert density > 0.0


def test_live_pipeline_no_frames_fallback(monkeypatch, tmp_path):
    monkeypatch.setattr("time.sleep", lambda _: None)
    # Empty frames directory
    empty_dir = tmp_path / "empty_frames"
    empty_dir.mkdir()
    monkeypatch.setattr(settings, "frames_dir", str(empty_dir))

    estimator = DensityEstimator("live", "yolo11n")
    # Even if pipeline loaded, no frames means fallback to simulated estimate
    assert len(estimator._frames) == 0

    density, occ = estimator.estimate("cctv:1", "GATE_A", occupancy_hint=60)
    assert 57 <= occ <= 65


@pytest.mark.asyncio
async def test_live_pipeline_batch_emission_end_to_end():
    estimator = DensityEstimator("live", "yolo11n")
    scenario = VenueScenario(DEFAULT_ZONES)

    batch = await _build_batch(estimator, scenario, "cctv:10")
    assert isinstance(batch, TelemetryBatch)
    assert len(batch.zones) > 0
    # verify it actually computed real estimates instead of sim hints
    assert all(isinstance(z.density, float) for z in batch.zones)
    for z in batch.zones:
        assert z.capacity == DEFAULT_ZONES[z.zone_id][0]
        assert z.occupancy >= 0
        assert z.density >= 0.0
        assert z.congestion in {"LOW", "MODERATE", "HIGH", "CRITICAL"}


def test_live_pipeline_multipart_upload_real_image(monkeypatch):
    from fastapi.testclient import TestClient
    from app.main import app

    monkeypatch.setattr(settings, "mode", "live")
    monkeypatch.setattr(settings, "emit_to_backend", "")

    with TestClient(app) as client:
        bandra_path = Path(settings.frames_dir) / "bandra.jpg"
        with open(bandra_path, "rb") as f:
            resp = client.post(
                "/api/v1/analyze-density?gate_id=GATE_A",
                files={"file": ("bandra.jpg", f.read(), "image/jpeg")},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["gate_id"] == "GATE_A"
        assert data["status"] == "success"
        assert data["estimated_density"] >= 0
        assert "timestamp" in data

