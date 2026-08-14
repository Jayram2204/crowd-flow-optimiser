import asyncio
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import app.main as telemetry_main
from app.core.config import settings
from app.main import app


def _client():
    # Keep the lifespan from firing the background emitter against a backend.
    settings.emit_to_backend = ""
    settings.mode = "simulated"
    return TestClient(app)


def test_healthz_reports_mode():
    with _client() as c:
        r = c.get("/healthz")
        assert r.status_code == 200
        body = r.json()
        assert body["service"] == "cfo-ai-telemetry"
        assert body["mode"] == "simulated"


def test_models_metadata():
    with _client() as c:
        r = c.get("/v1/models")
        assert r.status_code == 200
        body = r.json()
        assert body["task"] == "object-detection"
        assert body["mode"] == "simulated"
        assert body["model_id"] == settings.hf_model_id


def test_models_metadata_when_estimator_none(monkeypatch):
    monkeypatch.setattr(telemetry_main, "estimator", None)
    with _client() as c:
        # After lifespan, estimator is set, but test the fallback when it's None
        monkeypatch.setattr(telemetry_main, "estimator", None)
        r = c.get("/v1/models")
        assert r.status_code == 200
        body = r.json()
        assert body["mode"] == settings.mode


def test_density_estimate_contract():
    with _client() as c:
        r = c.post("/v1/density/estimate", json={"frame_ref": "cctv:1", "zone_id": "GATE_A"})
        assert r.status_code == 200
        body = r.json()
        assert body["zone_id"] == "GATE_A"
        assert body["density"] >= 0
        assert body["occupancy"] >= 0
        assert body["congestion"] in {"LOW", "MODERATE", "HIGH", "CRITICAL"}
        assert body["mode"] == "simulated"


def test_density_estimate_unknown_zone():
    with _client() as c:
        r = c.post("/v1/density/estimate", json={"frame_ref": "cctv:1", "zone_id": "NOPE"})
        assert r.status_code == 400
        assert "Unknown zone_id" in r.json()["detail"]


def test_density_estimate_inference_error(monkeypatch):
    with _client() as c:
        def boom(*_a, **_k):
            raise RuntimeError("inference failed")

        monkeypatch.setattr(telemetry_main.estimator, "estimate", boom)
        r = c.post("/v1/density/estimate", json={"frame_ref": "cctv:1", "zone_id": "GATE_A"})
        assert r.status_code == 500
        assert r.json()["detail"] == "Inference processing error"


def test_analyze_density_upload():
    with _client() as c:
        r = c.post(
            "/api/v1/analyze-density?gate_id=GATE_A",
            files={"file": ("frame.jpg", b"fake-image-bytes", "image/jpeg")},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["gate_id"] == "GATE_A"
        assert body["status"] == "success"
        assert body["estimated_density"] > 0
        assert "timestamp" in body


def test_analyze_density_upload_png():
    with _client() as c:
        r = c.post(
            "/api/v1/analyze-density?gate_id=GATE_A",
            files={"file": ("gate_a_feed.png", b"fake-image-bytes", "image/png")},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "success"


def test_analyze_density_invalid_mime_type():
    with _client() as c:
        r = c.post(
            "/api/v1/analyze-density?gate_id=GATE_A",
            files={"file": ("test.txt", b"plain text data", "text/plain")},
        )
        assert r.status_code == 400
        assert "Invalid file type" in r.json()["detail"]


def test_analyze_density_unknown_gate():
    with _client() as c:
        r = c.post(
            "/api/v1/analyze-density?gate_id=INVALID_GATE",
            files={"file": ("frame.jpg", b"fake-image-bytes", "image/jpeg")},
        )
        assert r.status_code == 400
        assert "Unknown zone_id" in r.json()["detail"]


def test_analyze_density_inference_error(monkeypatch):
    with _client() as c:
        def boom(*_a, **_k):
            raise RuntimeError("vision pipeline failed")

        monkeypatch.setattr(telemetry_main.estimator, "estimate", boom)
        r = c.post(
            "/api/v1/analyze-density?gate_id=GATE_A",
            files={"file": ("frame.jpg", b"fake-image-bytes", "image/jpeg")},
        )
        assert r.status_code == 500
        assert r.json()["detail"] == "Inference processing error"


def test_analyze_density_missing_content_type():
    with _client() as c:
        # File with empty/missing content_type
        r = c.post(
            "/api/v1/analyze-density?gate_id=GATE_A",
            files={"file": ("frame.bin", b"data", "")},
        )
        assert r.status_code == 400
        assert "Invalid file type" in r.json()["detail"]


@pytest.mark.asyncio
async def test_analyze_density_fallback_filename():
    from io import BytesIO
    from fastapi import UploadFile
    from app.main import analyze_density
    import app.main as telemetry_main

    telemetry_main.estimator = telemetry_main.DensityEstimator("simulated", "yolo11n")
    file = UploadFile(file=BytesIO(b"image-data"), filename=None, headers={"content-type": "image/jpeg"})
    res = await analyze_density(gate_id="GATE_A", file=file)
    assert res["gate_id"] == "GATE_A"
    assert res["status"] == "success"



def test_lifespan_task_management(monkeypatch):
    # Test lifespan when emit_to_backend is configured
    monkeypatch.setattr(settings, "emit_to_backend", "http://localhost:8080/api/v1/telemetry")
    monkeypatch.setattr(settings, "mode", "simulated")

    mock_run = MagicMock()

    async def fake_run_forever(estimator):
        try:
            while True:
                await asyncio.sleep(0.01)
        except asyncio.CancelledError:
            mock_run()
            raise

    with patch("app.main.run_forever", side_effect=fake_run_forever):
        with TestClient(app) as c:
            r = c.get("/healthz")
            assert r.status_code == 200
        # When exiting context, task should be cancelled
        assert mock_run.called

