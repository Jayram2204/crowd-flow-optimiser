"""Vision-model seam for CCTV -> density estimation.

The prototype ships in SIMULATED mode: no real frames, no HF billing. It
emits realistic density signals so the agent network and UI are exercised
end to end. In LIVE mode it runs a real detector over a looped set of
permissively licensed sample frames and derives occupancy from detected
persons: Ultralytics YOLO (e.g. yolo11n) when available, otherwise the
Hugging Face object-detection pipeline (e.g. facebook/detr-resnet-50).
Both modes expose the identical contract, so the rest of the stack never
knows the difference.
"""
import base64
import hashlib
import logging
import math
import os
import random
import tempfile
import time
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from app.core.config import settings

log = logging.getLogger("cfo.vision")


class DensityEstimator:
    """Estimates crowd density from a frame reference.

    mode="simulated": returns a deterministic-ish pseudo estimate.
    mode="live":      runs a real detector locally (Ultralytics YOLO when
                      available, else a HF transformers pipeline).
    """

    PERSON_MIN_SCORE = 0.5
    FRAME_CACHE_TTL = 8.0

    def __init__(self, mode: str, model_id: str, token: Optional[str] = None) -> None:
        self.mode = mode
        self.hf_model_id = model_id
        self.token = token
        self._pipeline = None
        self._model_backend = "none"
        self._frames: List[Path] = []
        self._frame_cache: Dict[str, Tuple[int, float]] = {}
        self._frame_seq = 0
        if mode == "live":
            self._load_frames()
            self._try_load_pipeline()

    def _load_frames(self) -> None:
        frames_dir = Path(settings.frames_dir)
        if frames_dir.is_dir():
            self._frames = sorted(p for p in frames_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
        log.info("live frames available: %d in %s", len(self._frames), frames_dir)
        if not self._frames:
            log.warning("no sample frames found; live inference will fall back to simulated")

    def _try_load_pipeline(self) -> None:
        # Ultralytics YOLO is preferred when installed: it is the faster,
        # native detector. The transformers pipeline remains as a fallback
        # for DETR-style HF checkpoints.
        if self._try_load_yolo():
            return
        self._try_load_transformers()

    def _try_load_yolo(self) -> bool:
        try:
            from ultralytics import YOLO  # type: ignore
        except Exception:
            return False
        try:
            import torch  # type: ignore

            model = YOLO(self._resolve_model_path())
            device = "mps" if torch.backends.mps.is_available() else "cpu"

            def _infer(path: str) -> List[dict]:
                results = model.predict(path, verbose=False, device=device)
                if not isinstance(results, list):
                    results = [results]
                detections: List[dict] = []
                for r in results:
                    names = r.names
                    for box in r.boxes:
                        detections.append(
                            {
                                "label": names[int(box.cls[0].item())],
                                "score": float(box.conf[0].item()),
                            }
                        )
                return detections

            self._pipeline = _infer
            self._model_backend = "ultralytics-yolo"
            log.info("live vision pipeline loaded: %s (backend=%s device=%s)", self.hf_model_id, self._model_backend, device)
            return True
        except Exception as exc:  # noqa: BLE001
            log.warning("failed to load ultralytics YOLO (%s); trying transformers", exc)
            return False

    def _resolve_model_path(self) -> str:
        """Prefer weights shipped with the app so cold starts never download.

        Looks up ``<weights_dir>/<model_id>.pt`` first (e.g. yolo11n.pt baked
        into the image); falls back to the bare model id, letting ultralytics
        download on first run when no local weights exist.
        """
        local = Path(settings.weights_dir) / f"{self.hf_model_id}.pt"
        if local.is_file():
            log.info("using local YOLO weights: %s", local)
            return str(local)
        return self.hf_model_id

    def _try_load_transformers(self) -> None:
        try:
            from transformers import pipeline  # type: ignore

            import torch  # type: ignore

            device = "mps" if torch.backends.mps.is_available() else "cpu"
            self._pipeline = pipeline(
                "object-detection",
                model=self.hf_model_id,
                token=self.token or None,
                device=device,
            )
            self._model_backend = "transformers"
            log.info("live vision pipeline loaded: %s (backend=%s device=%s)", self.hf_model_id, self._model_backend, device)
        except Exception as exc:  # noqa: BLE001
            log.warning("failed to load live pipeline (%s); degrading to simulated", exc)
            self.mode = "simulated"

    def estimate(self, frame_ref: str, zone_id: str, occupancy_hint: int) -> Tuple[float, int]:
        """Return (density_pp_per_m2, estimated_occupancy)."""
        if frame_ref.startswith("data:image/"):
            if self._pipeline is None:
                log.info("Live webcam frame received! Bootstrapping vision pipeline on the fly...")
                self._try_load_pipeline()
            if self._pipeline is not None:
                return self._live_estimate_base64(frame_ref, zone_id)
            return self._simulated_estimate(frame_ref, zone_id, occupancy_hint)
        if self.mode == "live" and self._pipeline is not None and self._frames:
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

    def _frame_for(self, zone_id: str) -> Path:
        """Pick a sample frame deterministically per zone, advancing each
        tick so consecutive emissions read different images and the density
        signal visibly responds to the footage."""
        n = len(self._frames)
        seed = int(hashlib.md5(zone_id.encode()).hexdigest(), 16)
        return self._frames[(seed % n + self._frame_seq) % n]

    def _count_persons(self, path: Path) -> int:
        now = time.time()
        hit = self._frame_cache.get(str(path))
        if hit and now - hit[1] < self.FRAME_CACHE_TTL:
            return hit[0]
        detections = self._pipeline(str(path))
        count = sum(
            1
            for d in detections
            if d.get("label") == "person" and d.get("score", 0) >= self.PERSON_MIN_SCORE
        )
        self._frame_cache[str(path)] = (count, now)
        log.debug("detected %d persons in %s", count, path.name)
        return count

    def _live_estimate(self, frame_ref: str, zone_id: str) -> Tuple[float, int]:
        self._frame_seq += 1
        frame = self._frame_for(zone_id)
        persons = self._count_persons(frame)
        capacity, area = settings.zones[zone_id]
        occupancy = min(persons, capacity)
        density = round(occupancy / area, 3)
        log.info("live inference %s zone=%s frame=%s persons=%d density=%.3f", frame_ref, zone_id, frame.name, persons, density)
        return density, occupancy

    def _live_estimate_base64(self, frame_ref: str, zone_id: str) -> Tuple[float, int]:
        try:
            header, encoded = frame_ref.split(",", 1)
            data = base64.b64decode(encoded)
            with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tf:
                tf.write(data)
                tf_path = Path(tf.name)
            
            try:
                # Bypass the 8-second cache so every webcam frame is actually processed
                detections = self._pipeline(str(tf_path))
                persons = sum(
                    1 for d in detections
                    if d.get("label") == "person" and d.get("score", 0) >= self.PERSON_MIN_SCORE
                )
                
                capacity, area = settings.zones[zone_id]
                occupancy = min(persons, capacity)
                density = round(occupancy / area, 3)
                log.info("live webcam zone=%s persons=%d density=%.3f", zone_id, persons, density)
                return density, occupancy
            finally:
                tf_path.unlink(missing_ok=True)
        except Exception as e:
            log.error("Failed to parse base64 frame: %s", e)
            return self._simulated_estimate(frame_ref, zone_id, 0)

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
