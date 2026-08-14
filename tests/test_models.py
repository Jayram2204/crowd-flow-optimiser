from app.models import DensityEstimateResponse, TelemetryBatch, ZoneMetric


def test_zone_metric_serializes_with_timestamp():
    zm = ZoneMetric(
        zone_id="GATE_A",
        capacity=120,
        density=0.9,
        occupancy=108,
        congestion="HIGH",
        inflow_rate=1.0,
        outflow_rate=2.0,
        timestamp="2026-08-13T10:00:00Z",
    )
    d = zm.model_dump()
    assert d["zone_id"] == "GATE_A"
    assert d["congestion"] == "HIGH"
    assert d["timestamp"].startswith("2026-08-13")


def test_telemetry_batch_roundtrip():
    batch = TelemetryBatch(
        zones=[
            ZoneMetric(
                zone_id="A",
                capacity=10,
                density=0.1,
                occupancy=1,
                congestion="LOW",
                inflow_rate=0.0,
                outflow_rate=0.0,
            ),
            ZoneMetric(
                zone_id="B",
                capacity=10,
                density=0.9,
                occupancy=9,
                congestion="HIGH",
                inflow_rate=1.0,
                outflow_rate=2.0,
            ),
        ]
    )
    assert len(batch.zones) == 2
    assert batch.zones[1].congestion == "HIGH"


def test_density_estimate_response():
    r = DensityEstimateResponse(
        zone_id="GATE_A",
        density=0.6,
        occupancy=72,
        congestion="MODERATE",
        model="facebook/detr-resnet-50",
        mode="live",
        frame_ref="cctv:1",
    )
    d = r.model_dump()
    assert d["mode"] == "live"
    assert d["density"] == 0.6
