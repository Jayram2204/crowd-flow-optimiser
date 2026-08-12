from typing import List, Optional
from pydantic import BaseModel, Field

from app.core.config import settings


class DensityEstimateRequest(BaseModel):
    frame_ref: str = Field(description="Identifier for the CCTV frame / stream segment")
    zone_id: str = Field(description="Zone this frame belongs to")


class DensityEstimateResponse(BaseModel):
    zone_id: str
    density: float = Field(description="Estimated people per square metre (0..~2)")
    occupancy: int
    congestion: str
    model: str
    mode: str
    frame_ref: str


class ZoneMetric(BaseModel):
    zone_id: str
    capacity: int
    density: float
    occupancy: int
    congestion: str
    inflow_rate: float
    outflow_rate: float
    timestamp: Optional[str] = None


class TelemetryBatch(BaseModel):
    zones: List[ZoneMetric]
