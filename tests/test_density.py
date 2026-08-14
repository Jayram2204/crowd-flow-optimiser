import sys
import types
from pathlib import Path

import pytest

from app.core.config import settings
from app.services.density import DensityEstimator


def test_classify_thresholds():
    e = DensityEstimator("simulated", "test-model")
    assert e.classify(0.49) == "LOW"
    assert e.classify(0.5) == "MODERATE"
    assert e.classify(0.79) == "MODERATE"
    assert e.classify(0.8) == "HIGH"
    assert e.classify(0.999) == "HIGH"
    assert e.classify(1.0) == "CRITICAL"


def test_simulated_estimate_contract(monkeypatch):
    monkeypatch.setattr("time.sleep", lambda _: None)
    monkeypatch.setattr(settings, "zones", {"GATE_A": (120, 60.0)})
    e = DensityEstimator("simulated", "test-model")
    density, occ = e.estimate("cctv:1", "GATE_A", occupancy_hint=100)
    assert 95 <= occ <= 108  # hint * jitter(0.95..1.08)
    assert density == pytest.approx(occ / 60.0, abs=0.001)
    assert e.mode == "simulated"


def test_live_estimate_counts_persons(monkeypatch, tmp_path):
    (tmp_path / "crowd.jpg").write_bytes(b"fake-image")
    monkeypatch.setattr(settings, "frames_dir", str(tmp_path))
    monkeypatch.setattr(settings, "zones", {"GATE_A": (120, 60.0)})

    e = DensityEstimator("live", "test-model")

    def fake_pipeline(path):
        return [
            {"label": "person", "score": 0.9},
            {"label": "person", "score": 0.51},
            {"label": "person", "score": 0.1},  # below threshold -> ignored
            {"label": "umbrella", "score": 0.99},  # wrong class -> ignored
        ]

    e._pipeline = fake_pipeline
    e.mode = "live"  # suppress the real model download in unit tests
    density, occ = e.estimate("cctv:1", "GATE_A", occupancy_hint=0)
    assert occ == 2  # two persons above threshold
    assert density == pytest.approx(2 / 60.0, abs=0.001)


def test_live_estimate_caps_at_capacity(monkeypatch, tmp_path):
    (tmp_path / "crowd.jpg").write_bytes(b"fake-image")
    monkeypatch.setattr(settings, "frames_dir", str(tmp_path))
    monkeypatch.setattr(settings, "zones", {"GATE_A": (120, 60.0)})
    e = DensityEstimator("live", "test-model")
    e._pipeline = lambda _p: [{"label": "person", "score": 0.9}] * 500
    e.mode = "live"
    _, occ = e.estimate("cctv:1", "GATE_A", 0)
    assert occ == 120  # never exceeds capacity


def test_frame_cache_avoids_reinference(monkeypatch, tmp_path):
    (tmp_path / "crowd.jpg").write_bytes(b"fake-image")
    monkeypatch.setattr(settings, "frames_dir", str(tmp_path))
    monkeypatch.setattr(settings, "zones", {"GATE_A": (120, 60.0)})
    e = DensityEstimator("live", "test-model")

    calls = []

    def fake_pipeline(_p):
        calls.append(1)
        return [{"label": "person", "score": 0.9}]

    e._pipeline = fake_pipeline
    e._count_persons(Path(tmp_path / "crowd.jpg"))
    e._count_persons(Path(tmp_path / "crowd.jpg"))
    assert len(calls) == 1  # second call served from cache


def test_frames_advance_per_tick(monkeypatch, tmp_path):
    for i in range(3):
        (tmp_path / f"f{i}.jpg").write_bytes(b"x")
    monkeypatch.setattr(settings, "frames_dir", str(tmp_path))
    monkeypatch.setattr(settings, "zones", {"GATE_A": (120, 60.0)})
    e = DensityEstimator("live", "test-model")
    first = e._frame_for("GATE_A")
    e._frame_seq += 1
    second = e._frame_for("GATE_A")
    assert first != second  # density signal responds to footage over time


def test_pipeline_load_failure_degrades_to_simulated(monkeypatch):
    monkeypatch.setenv("AI_FRAMES_DIR", "/nonexistent")
    # Force the transformers path: with ultralytics present, YOLO would be
    # attempted first (and would touch the network for a fake model id).
    monkeypatch.setitem(sys.modules, "ultralytics", None)

    import transformers

    def boom(*_a, **_k):
        raise RuntimeError("no network")

    monkeypatch.setattr(transformers, "pipeline", boom)
    e = DensityEstimator("live", "test-model")
    assert e.mode == "simulated"
    assert e._pipeline is None


def _fake_ultralytics(boxes):
    """Injects a fake ultralytics module whose YOLO returns a canned detector."""

    class T:
        def __init__(self, value):
            self._value = value

        def item(self):
            return self._value

    class FakeBox:
        def __init__(self, cls, conf):
            self.cls = [T(cls)]  # box.cls[0].item() -> class id
            self.conf = [T(conf)]  # box.conf[0].item() -> confidence

    class FakeResult:
        names = {0: "person", 1: "umbrella"}

        def __init__(self, detections):
            self.boxes = [FakeBox(*d) for d in detections]

    class FakeModel:
        def __init__(self, detections):
            self._detections = detections

        def predict(self, *_a, **_k):
            return FakeResult(self._detections)  # single result, not a list

    mod = types.ModuleType("ultralytics")
    mod.YOLO = lambda _model_id: FakeModel(boxes)
    return mod


def test_yolo_backend_counts_persons(monkeypatch, tmp_path):
    (tmp_path / "crowd.jpg").write_bytes(b"fake-image")
    monkeypatch.setattr(settings, "frames_dir", str(tmp_path))
    monkeypatch.setattr(settings, "zones", {"GATE_A": (120, 60.0)})
    monkeypatch.setitem(
        sys.modules,
        "ultralytics",
        _fake_ultralytics([(0, 0.9), (0, 0.55), (0, 0.1), (1, 0.99)]),
    )

    e = DensityEstimator("live", "yolo11n")
    assert e.mode == "live"
    assert e._model_backend == "ultralytics-yolo"
    density, occ = e.estimate("cctv:1", "GATE_A", 0)
    assert occ == 2  # two persons above threshold; umbrella ignored
    assert density == pytest.approx(2 / 60.0, abs=0.001)


def test_yolo_backend_falls_back_to_transformers_on_load_error(monkeypatch):
    monkeypatch.setenv("AI_FRAMES_DIR", "/nonexistent")
    mod = types.ModuleType("ultralytics")
    mod.YOLO = lambda _model_id: (_ for _ in ()).throw(RuntimeError("bad weights"))
    monkeypatch.setitem(sys.modules, "ultralytics", mod)

    import transformers

    calls = []

    def fake_pipeline(*_a, **_k):
        calls.append(1)
        return object()

    monkeypatch.setattr(transformers, "pipeline", fake_pipeline)
    e = DensityEstimator("live", "some-model")
    assert e.mode == "live"
    assert e._model_backend == "transformers"
    assert calls == [1]


def _fake_ultralytics_capture():
    """Fake ultralytics whose YOLO factory records the model id handed to it."""
    seen = {}

    class T:
        def __init__(self, value):
            self._value = value

        def item(self):
            return self._value

    class FakeBox:
        def __init__(self, cls, conf):
            self.cls = [T(cls)]
            self.conf = [T(conf)]

    class FakeResult:
        names = {0: "person"}

        def __init__(self, detections):
            self.boxes = [FakeBox(*d) for d in detections]

    class FakeModel:
        def predict(self, *_a, **_k):
            return FakeResult([(0, 0.9)])

    def make_yolo(model_id):
        seen["path"] = model_id
        return FakeModel()

    mod = types.ModuleType("ultralytics")
    mod.YOLO = make_yolo
    return mod, seen


def test_yolo_prefers_local_weights(monkeypatch, tmp_path):
    weights = tmp_path / "yolo11n.pt"
    weights.write_bytes(b"baked-weights")
    monkeypatch.setattr(settings, "weights_dir", str(tmp_path))
    monkeypatch.setattr(settings, "frames_dir", str(tmp_path))
    mod, seen = _fake_ultralytics_capture()
    monkeypatch.setitem(sys.modules, "ultralytics", mod)

    e = DensityEstimator("live", "yolo11n")
    assert e.mode == "live"
    assert e._model_backend == "ultralytics-yolo"
    assert seen["path"] == str(weights)  # no bare-id download


def test_yolo_bare_id_when_weights_absent(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "weights_dir", str(tmp_path / "nonexistent"))
    monkeypatch.setattr(settings, "frames_dir", str(tmp_path))
    mod, seen = _fake_ultralytics_capture()
    monkeypatch.setitem(sys.modules, "ultralytics", mod)

    DensityEstimator("live", "yolo11n")
    assert seen["path"] == "yolo11n"  # ultralytics downloads on first run
