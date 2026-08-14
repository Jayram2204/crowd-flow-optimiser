import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List

# Default venue topology: zone id -> (capacity, viewport area m2). The area is
# the CCTV viewport footprint the density seam observes, not the whole venue
# floor, so real person counts land on realistic people-per-m2 readings.
DEFAULT_ZONES: Dict[str, tuple] = {
    "CONCOURSE_A": (400, 120.0),
    "BAG_CHECK": (150, 70.0),
    "E_PIER": (200, 85.0),
    "GATE_A": (120, 60.0),
    "GATE_B": (120, 60.0),
    "PLATFORM_1": (300, 90.0),
    "PLATFORM_2": (300, 90.0),
    "SECURITY_T1": (100, 55.0),
    "SECURITY_T2": (100, 55.0),
}

# Data shipped alongside the app (sample CCTV frames + model weights). Relative
# to this file so the seam works identically on a laptop and inside a container
# where WORKDIR is not the repository root.
_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"


@dataclass
class Settings:
    http_addr: str = field(default_factory=lambda: os.getenv("AI_HTTP_ADDR", "0.0.0.0:8000"))
    sim_loop_seconds: float = field(default_factory=lambda: float(os.getenv("AI_SIM_LOOP_INTERVAL_SECONDS", "2")))
    emit_to_backend: str = field(
        default_factory=lambda: os.getenv("AI_EMIT_TO_BACKEND", "http://localhost:8080/api/v1/telemetry")
    )
    hf_model_id: str = field(default_factory=lambda: os.getenv("AI_HF_MODEL_ID", "yolo11n"))
    mode: str = field(default_factory=lambda: os.getenv("AI_MODE", "simulated").lower())
    hf_token: str = field(default_factory=lambda: os.getenv("HF_TOKEN", ""))
    frames_dir: str = field(
        default_factory=lambda: os.getenv("AI_FRAMES_DIR", str(_DATA_DIR / "frames"))
    )
    weights_dir: str = field(
        default_factory=lambda: os.getenv("AI_WEIGHTS_DIR", str(_DATA_DIR / "weights"))
    )
    zones: Dict[str, tuple] = field(default_factory=lambda: dict(DEFAULT_ZONES))

    @property
    def zone_ids(self) -> List[str]:
        return list(self.zones.keys())


settings = Settings()
