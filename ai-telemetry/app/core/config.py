import os
from dataclasses import dataclass, field
from typing import Dict, List

# Default venue topology: zone id -> (capacity, area m2). Density is derived
# as occupancy / area, the same signal a CSRNet-style model would emit.
DEFAULT_ZONES: Dict[str, tuple] = {
    "CONCOURSE_A": (400, 420.0),
    "BAG_CHECK": (150, 160.0),
    "E_PIER": (200, 210.0),
    "GATE_A": (120, 130.0),
    "GATE_B": (120, 130.0),
    "PLATFORM_1": (300, 320.0),
    "PLATFORM_2": (300, 320.0),
    "SECURITY_T1": (100, 110.0),
    "SECURITY_T2": (100, 110.0),
}


@dataclass
class Settings:
    http_addr: str = field(default_factory=lambda: os.getenv("AI_HTTP_ADDR", "0.0.0.0:8000"))
    sim_loop_seconds: float = field(default_factory=lambda: float(os.getenv("AI_SIM_LOOP_INTERVAL_SECONDS", "2")))
    emit_to_backend: str = field(
        default_factory=lambda: os.getenv("AI_EMIT_TO_BACKEND", "http://localhost:8080/api/v1/telemetry")
    )
    hf_model_id: str = field(default_factory=lambda: os.getenv("AI_HF_MODEL_ID", "csrnet-pytorch"))
    mode: str = field(default_factory=lambda: os.getenv("AI_MODE", "simulated").lower())
    hf_token: str = field(default_factory=lambda: os.getenv("HF_TOKEN", ""))
    zones: Dict[str, tuple] = field(default_factory=lambda: dict(DEFAULT_ZONES))

    @property
    def zone_ids(self) -> List[str]:
        return list(self.zones.keys())


settings = Settings()
