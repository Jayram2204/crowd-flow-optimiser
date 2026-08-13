import asyncio
import logging
import random
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.models import DensityEstimateRequest, DensityEstimateResponse
from app.services.density import DensityEstimator
from app.services.simulator import run_forever

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s :: %(message)s")
log = logging.getLogger("cfo.telemetry")

estimator: DensityEstimator


@asynccontextmanager
async def lifespan(app: FastAPI):
    global estimator
    estimator = DensityEstimator(settings.mode, settings.hf_model_id, settings.hf_token)
    log.info("vision seam ready :: mode=%s model=%s", estimator.mode, estimator.hf_model_id)
    log.info("telemetry emitter targeting %s every %.1fs", settings.emit_to_backend, settings.sim_loop_seconds)
    task = None
    if settings.emit_to_backend:
        task = asyncio.create_task(run_forever(estimator))
    yield
    if task:
        task.cancel()


app = FastAPI(title="Crowd Flow Optimiser - AI Telemetry Layer", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
async def healthz() -> dict:
    return {"service": "cfo-ai-telemetry", "status": "ok", "mode": settings.mode}


@app.get("/v1/models")
async def models() -> dict:
    return {
        "model_id": settings.hf_model_id,
        "mode": estimator.mode if estimator else settings.mode,
        "task": "crowd-density-estimation",
        "note": "CSRNet-style crowd counting; density normalised to people/m2",
    }


@app.post("/v1/density/estimate", response_model=DensityEstimateResponse)
async def density_estimate(req: DensityEstimateRequest) -> DensityEstimateResponse:
    occupancy_hint = 0
    density, occ = estimator.estimate(req.frame_ref, req.zone_id, occupancy_hint)
    return DensityEstimateResponse(
        zone_id=req.zone_id,
        density=density,
        occupancy=occ,
        congestion=estimator.classify(density),
        model=estimator.hf_model_id,
        mode=estimator.mode,
        frame_ref=req.frame_ref,
    )


@app.post("/api/v1/analyze-density")
async def analyze_density(gate_id: str, file: UploadFile = File(...)) -> dict:
    """Exact Phase 2 contract: per-frame density analysis for one gate.

    Production: sends the uploaded frame to a Hugging Face CSRNet crowd-
    counting model via the huggingface_hub inference client. Prototype:
    simulates ~150ms vision inference through the same seam.
    """
    await asyncio.sleep(0.15)
    frame_ref = file.filename or f"cctv:{gate_id}"
    _, estimated_crowd_size = estimator.estimate(frame_ref, gate_id, random.randint(10, 120))
    return {
        "gate_id": gate_id,
        "status": "success",
        "model_used": f"HF/{estimator.hf_model_id}",
        "estimated_density": estimated_crowd_size,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
