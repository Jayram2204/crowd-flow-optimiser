import asyncio
from datetime import datetime
from unittest.mock import patch

import httpx
import pytest

from app.core.config import DEFAULT_ZONES, settings
import app.services.simulator as simulator
from app.services.density import DensityEstimator, VenueScenario
from app.services.simulator import _build_batch, run_forever


@pytest.fixture(autouse=True)
def fast_tests(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda _: None)
    monkeypatch.setattr(settings, "sim_loop_seconds", 0.001)


def test_build_batch_simulated_mode():
    estimator = DensityEstimator("simulated", "yolo11n")
    scenario = VenueScenario(DEFAULT_ZONES)
    batch = _build_batch(estimator, scenario, "cctv:1")

    assert len(batch.zones) == len(DEFAULT_ZONES)
    zone_ids = {z.zone_id for z in batch.zones}
    assert zone_ids == set(DEFAULT_ZONES.keys())

    for z in batch.zones:
        cap, area = DEFAULT_ZONES[z.zone_id]
        assert z.capacity == cap
        assert z.occupancy >= 0
        assert z.density >= 0.0
        assert z.congestion in {"LOW", "MODERATE", "HIGH", "CRITICAL"}
        assert z.inflow_rate >= 0.0
        assert z.outflow_rate >= 0.0
        assert z.timestamp is not None
        # Verify timestamp can be parsed as ISO format
        dt = datetime.fromisoformat(z.timestamp)
        assert dt is not None


def test_build_batch_live_mode(monkeypatch, tmp_path):
    (tmp_path / "frame.jpg").write_bytes(b"image")
    monkeypatch.setattr(settings, "frames_dir", str(tmp_path))

    estimator = DensityEstimator("live", "test-model")
    estimator._pipeline = lambda _p: [{"label": "person", "score": 0.9}] * 10
    estimator.mode = "live"

    scenario = VenueScenario(DEFAULT_ZONES)
    batch = _build_batch(estimator, scenario, "cctv:42")

    assert len(batch.zones) == len(DEFAULT_ZONES)
    for z in batch.zones:
        assert z.occupancy == 10
        assert z.density == pytest.approx(round(10 / DEFAULT_ZONES[z.zone_id][1], 3))


@pytest.mark.asyncio
async def test_run_forever_successful_emissions(monkeypatch):
    monkeypatch.setattr(simulator, "_frames", 0)
    estimator = DensityEstimator("simulated", "yolo11n")

    posted_payloads = []

    async def fake_post(self, url, **kwargs):
        posted_payloads.append((url, kwargs.get("json")))
        return httpx.Response(202, json={"accepted": 9, "status": "ingested"})

    with patch.object(httpx.AsyncClient, "post", fake_post):
        task = asyncio.create_task(run_forever(estimator))
        for _ in range(50):
            if len(posted_payloads) >= 3:
                break
            await asyncio.sleep(0.01)

        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    assert len(posted_payloads) >= 3
    for url, payload in posted_payloads:
        assert url == settings.emit_to_backend
        assert "zones" in payload
        assert len(payload["zones"]) == len(DEFAULT_ZONES)


@pytest.mark.asyncio
async def test_run_forever_success_200_response(monkeypatch):
    monkeypatch.setattr(simulator, "_frames", 0)
    estimator = DensityEstimator("simulated", "yolo11n")

    calls = 0

    async def fake_post_200(self, url, **kwargs):
        nonlocal calls
        calls += 1
        return httpx.Response(200, json={"status": "ok"})

    with patch.object(httpx.AsyncClient, "post", fake_post_200):
        task = asyncio.create_task(run_forever(estimator))
        for _ in range(50):
            if calls >= 2:
                break
            await asyncio.sleep(0.01)

        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    assert calls >= 2


@pytest.mark.asyncio
async def test_run_forever_backend_rejected_status(monkeypatch):
    monkeypatch.setattr(simulator, "_frames", 0)
    estimator = DensityEstimator("simulated", "yolo11n")

    calls = 0

    async def fake_post_reject(self, url, **kwargs):
        nonlocal calls
        calls += 1
        return httpx.Response(400, text="Bad Request")

    with patch.object(httpx.AsyncClient, "post", fake_post_reject):
        task = asyncio.create_task(run_forever(estimator))
        for _ in range(50):
            if calls >= 2:
                break
            await asyncio.sleep(0.01)

        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    assert calls >= 2


@pytest.mark.asyncio
async def test_run_forever_backend_500_status(monkeypatch):
    monkeypatch.setattr(simulator, "_frames", 0)
    estimator = DensityEstimator("simulated", "yolo11n")

    calls = 0

    async def fake_post_500(self, url, **kwargs):
        nonlocal calls
        calls += 1
        return httpx.Response(500, text="Internal Server Error")

    with patch.object(httpx.AsyncClient, "post", fake_post_500):
        task = asyncio.create_task(run_forever(estimator))
        for _ in range(50):
            if calls >= 2:
                break
            await asyncio.sleep(0.01)

        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    assert calls >= 2


@pytest.mark.asyncio
async def test_run_forever_backend_http_error(monkeypatch):
    monkeypatch.setattr(simulator, "_frames", 0)
    estimator = DensityEstimator("simulated", "yolo11n")

    calls = 0

    async def fake_post_error(self, url, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpx.ConnectError("Connection refused")
        if calls == 2:
            raise httpx.TimeoutException("Request timed out")
        raise httpx.HTTPError("Generic HTTP error")

    with patch.object(httpx.AsyncClient, "post", fake_post_error):
        task = asyncio.create_task(run_forever(estimator))
        for _ in range(50):
            if calls >= 3:
                break
            await asyncio.sleep(0.01)

        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    assert calls >= 3


@pytest.mark.asyncio
async def test_run_forever_frame_ref_increments(monkeypatch):
    monkeypatch.setattr(simulator, "_frames", 0)
    estimator = DensityEstimator("simulated", "yolo11n")

    frames_seen = []

    def mock_build_batch(est, scen, frame_ref):
        frames_seen.append(frame_ref)
        return _build_batch(est, scen, frame_ref)

    monkeypatch.setattr(simulator, "_build_batch", mock_build_batch)

    async def fake_post(self, url, **kwargs):
        return httpx.Response(202, json={"status": "ok"})

    with patch.object(httpx.AsyncClient, "post", fake_post):
        task = asyncio.create_task(run_forever(estimator))
        for _ in range(50):
            if len(frames_seen) >= 3:
                break
            await asyncio.sleep(0.01)

        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    assert len(frames_seen) >= 3
    assert frames_seen[0] == "cctv:1"
    assert frames_seen[1] == "cctv:2"
    assert frames_seen[2] == "cctv:3"


@pytest.mark.asyncio
async def test_run_forever_clean_cancellation():
    estimator = DensityEstimator("simulated", "yolo11n")

    async def fake_post_hang(self, url, **kwargs):
        return httpx.Response(200, json={})

    with patch.object(httpx.AsyncClient, "post", fake_post_hang):
        task = asyncio.create_task(run_forever(estimator))
        await asyncio.sleep(0.01)
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task

    assert task.cancelled()

