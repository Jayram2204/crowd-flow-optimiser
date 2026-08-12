import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
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
