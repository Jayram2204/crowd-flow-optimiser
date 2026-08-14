import pytest
from app.core.config import DEFAULT_ZONES, Settings


def test_default_zone_topology_has_nine_zones():
    assert len(DEFAULT_ZONES) == 9
    assert DEFAULT_ZONES["GATE_A"][0] > 0  # capacity
    assert DEFAULT_ZONES["GATE_A"][1] > 0  # viewport area


def test_settings_defaults():
    s = Settings()
    assert s.mode == "simulated"
    assert s.hf_model_id == "yolo11n"
    assert s.emit_to_backend == "http://localhost:8080/api/v1/telemetry"
    assert "GATE_A" in s.zone_ids
    assert len(s.zone_ids) == 9


def test_settings_env_overrides(monkeypatch):
    monkeypatch.setenv("AI_MODE", "live")
    monkeypatch.setenv("AI_HF_MODEL_ID", "custom/model")
    monkeypatch.setenv("AI_SIM_LOOP_INTERVAL_SECONDS", "5")
    s = Settings()
    assert s.mode == "live"
    assert s.hf_model_id == "custom/model"
    assert s.sim_loop_seconds == 5.0


def test_settings_mode_lowercased(monkeypatch):
    monkeypatch.setenv("AI_MODE", "LIVE")
    assert Settings().mode == "live"
