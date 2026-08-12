"""Vision-model seam for CCTV -> density estimation.

The prototype ships in SIMULATED mode: no real frames, no HF billing. It
emits realistic density signals so the agent network and UI are exercised
end to end. In LIVE mode it attempts a real Hugging Face inference pipeline
(CSRNet-style crowd density model). Both modes expose the identical contract,
so the rest of the stack never knows the difference.
"""
import logging
import math
import random
import time
from typing import Dict, List, Optional, Tuple

from app.core.config import settings

log = logging.getLogger("cfo.vision")


class DensityEstimator:
    """Estimates crowd density from a frame reference.

    mode="simulated": returns a deterministic-ish pseudo estimate.
    mode="live":      runs a real HF pipeline (requires HF_TOKEN + network).
    """

    def __init__(self, mode: str, model_id: str, token: Optional[str] = None) -> None:
        self.mode = mode
        self.hf_model_id = model_id
        self.token = token
        self._pipeline = None
        if mode == "live":
            self._try_load_pipeline()

    def _try_load_pipeline(self) -> None:
        try:
            from transformers import pipeline  # type: ignore

            self._pipeline = pipeline("image-classification", model=self.model_id, use_auth_token=self.token or None)
            log.info("live vision pipeline loaded: %s", self.model_id)
        except Exception as exc:  # noqa: BLE001
            log.warning("failed to load live pipeline (%s); degrading to simulated", exc)
            self.mode = "simulated"

    def estimate(self, frame_ref: str, zone_id: str, occupancy_hint: int) -> Tuple[float, int]:
        """Return (density_pp_per_m2, estimated_occupancy)."""
        if self.mode == "live" and self._pipeline is not None:
            return self._live_estimate(frame_ref, zone_id)
        return self._simulated_estimate(frame_ref, zone_id, occupancy_hint)

    def _simulated_estimate(self, frame_ref: str, zone_id: str, occupancy_hint: int) -> Tuple[float, int]:
        # Sub-second "inference" cost to mimic a model round trip.
        time.sleep(random.uniform(0.05, 0.15))
        _, area = settings.zones[zone_id]
        jitter = random.uniform(0.95, 1.08)
        occupancy = int(occupancy_hint * jitter)
        density = round(occupancy / area, 3)
        log.debug("sim inference %s zone=%s density=%.3f", frame_ref, zone_id, density)
        return density, occupancy

    def _live_estimate(self, frame_ref: str, zone_id: str) -> Tuple[float, int]:
        # Real integration point: load the frame (object store / CCTV API),
        # push through the density model, normalise to people/m2.
        raise NotImplementedError("live frame ingestion not wired for prototype")

    @staticmethod
    def classify(density: float) -> str:
        if density < 0.5:
            return "LOW"
        if density < 0.8:
            return "MODERATE"
        if density < 1.0:
            return "HIGH"
        return "CRITICAL"


class VenueScenario:
    """Synthetic crowd dynamics. Drives occupancy per zone with waves and
    scripted surges so the demo reliably shows negotiation cascades.
    """

    def __init__(self, zones: Dict[str, Tuple[int, float]]) -> None:
        self.zones = zones
        self.occupancy: Dict[str, float] = {}
        self.phase = 0.0
        for zid, (cap, _) in zones.items():
            self.occupancy[zid] = cap * random.uniform(0.25, 0.45)

    def tick(self) -> List[Tuple[str, int, float, float]]:
        """Advance one simulation step.

        Returns list of (zone_id, occupancy, inflow_rate, outflow_rate).
        """
        self.phase += 0.25
        out: List[Tuple[str, int, float, float]] = []

        # Wave envelope that sweeps congestion across the topology over time,
        # plus an event surge. At the default 1s tick cadence the gate cluster
        # blows past capacity ~20s in; the platforms stay under, so the agents
        # have somewhere real to negotiate the overflow TO.
        wave = 0.5 + 0.45 * abs(math.sin(self.phase))
        surge_active = 4 < self.phase % 10 < 6
        gate_cluster = {"GATE_A", "GATE_B", "E_PIER", "BAG_CHECK"}

        for zid, (cap, _) in self.zones.items():
            base = cap * wave
            if surge_active and zid in gate_cluster:
                base *= 1.9
            noise = random.uniform(-0.04, 0.06) * cap
            current = self.occupancy[zid]
            if surge_active and zid in gate_cluster:
                target = min(base + noise, cap * 1.28)
            else:
                target = min(base + noise, cap * 0.85 if surge_active else cap * 0.98)
            # Exponential relaxation towards target (0..1)
            current += (target - current) * 0.35
            current = max(0.0, current)
            self.occupancy[zid] = current
            occ = int(current)
            inflow = max(0.0, (target - current)) * 6
            outflow = max(0.0, (current - target)) * 6
            out.append((zid, occ, round(inflow, 1), round(outflow, 1)))
        return out
