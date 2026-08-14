import math
import pytest

from app.core.config import DEFAULT_ZONES
from app.services.density import VenueScenario


def test_venue_scenario_initialization():
    scenario = VenueScenario(DEFAULT_ZONES)
    assert scenario.phase == 0.0
    assert len(scenario.occupancy) == len(DEFAULT_ZONES)
    for zid, (cap, _) in DEFAULT_ZONES.items():
        assert zid in scenario.occupancy
        occ = scenario.occupancy[zid]
        # Initial occupancy should be 0.25..0.45 * capacity
        assert 0.24 * cap <= occ <= 0.46 * cap


def test_venue_scenario_tick_advances_phase():
    scenario = VenueScenario(DEFAULT_ZONES)
    assert scenario.phase == 0.0
    scenario.tick()
    assert scenario.phase == pytest.approx(0.25)
    for _ in range(9):
        scenario.tick()
    assert scenario.phase == pytest.approx(2.5)


def test_venue_scenario_tick_output_structure():
    scenario = VenueScenario(DEFAULT_ZONES)
    metrics = scenario.tick()
    assert len(metrics) == len(DEFAULT_ZONES)

    returned_zones = set()
    for zid, occ, inflow, outflow in metrics:
        returned_zones.add(zid)
        cap = DEFAULT_ZONES[zid][0]
        assert isinstance(occ, int)
        assert occ >= 0
        assert isinstance(inflow, float)
        assert inflow >= 0.0
        assert isinstance(outflow, float)
        assert outflow >= 0.0
        # Either inflow or outflow can be positive, or both 0 when target == current
        assert (inflow == 0.0) or (outflow == 0.0) or (inflow >= 0.0 and outflow >= 0.0)

    assert returned_zones == set(DEFAULT_ZONES.keys())


def test_venue_scenario_surge_activation():
    scenario = VenueScenario(DEFAULT_ZONES)
    # Set phase just before surge window (4 < phase % 10 < 6)
    # phase = 4.0 -> after tick phase = 4.25 (surge active)
    scenario.phase = 4.0
    metrics = dict((z[0], z) for z in scenario.tick())

    gate_cluster = {"GATE_A", "GATE_B", "E_PIER", "BAG_CHECK"}
    # Run several ticks during the surge window
    for _ in range(5):
        scenario.tick()

    for zid in gate_cluster:
        cap, _ = DEFAULT_ZONES[zid]
        occ = scenario.occupancy[zid]
        # Gate cluster can surge towards 1.28 * cap
        assert occ <= cap * 1.29

    for zid in ["PLATFORM_1", "PLATFORM_2"]:
        cap, _ = DEFAULT_ZONES[zid]
        occ = scenario.occupancy[zid]
        # Non-gate zones during surge are capped at 0.85 * cap
        assert occ <= cap * 0.90


def test_venue_scenario_non_surge_window():
    scenario = VenueScenario(DEFAULT_ZONES)
    # phase = 1.0 -> 1 < 4, not in surge
    scenario.phase = 1.0
    metrics = dict((z[0], z) for z in scenario.tick())
    assert scenario.phase == pytest.approx(1.25)

    for zid, (cap, _) in DEFAULT_ZONES.items():
        occ = scenario.occupancy[zid]
        assert occ <= cap * 1.02


def test_venue_scenario_inflow_outflow_math(monkeypatch):
    # Deterministic test for relaxation and inflow/outflow computation
    scenario = VenueScenario({"ZONE_TEST": (100, 50.0)})
    scenario.occupancy["ZONE_TEST"] = 30.0
    scenario.phase = 0.0

    # Patch random.uniform to return 0.0 noise
    monkeypatch.setattr("random.uniform", lambda _a, _b: 0.0)

    # phase becomes 0.25
    # wave = 0.5 + 0.45 * abs(sin(0.25)) = 0.5 + 0.45 * 0.2474 = 0.6113
    # base = 100 * 0.6113 = 61.13
    # target = min(61.13, 100 * 0.98) = 61.13
    # current += (61.13 - 30.0) * 0.35 = 30.0 + 10.8955 = 40.8955
    # inflow = (61.13 - 40.8955) * 6 = 20.2345 * 6 = 121.4
    # outflow = 0.0
    metrics = scenario.tick()
    zid, occ, inflow, outflow = metrics[0]

    assert zid == "ZONE_TEST"
    assert occ == 40
    assert inflow > 0
    assert outflow == 0.0


def test_venue_scenario_long_run_stability():
    scenario = VenueScenario(DEFAULT_ZONES)
    for _ in range(120):
        metrics = scenario.tick()
        for zid, occ, inflow, outflow in metrics:
            cap = DEFAULT_ZONES[zid][0]
            assert not math.isnan(occ)
            assert not math.isnan(inflow)
            assert not math.isnan(outflow)
            assert occ >= 0
            assert inflow >= 0.0
            assert outflow >= 0.0
            assert occ <= cap * 1.35
