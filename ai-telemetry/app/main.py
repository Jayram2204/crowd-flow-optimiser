import asyncio
import logging
import random
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, File, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import httpx

from app.core.config import settings
from app.models import DensityEstimateRequest, DensityEstimateResponse, TelemetryBatch, ZoneMetric
from app.services.density import DensityEstimator
from app.services.simulator import run_forever
import app.services.simulator as simulator

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s :: %(message)s")
log = logging.getLogger("cfo.telemetry")

estimator: DensityEstimator


@asynccontextmanager
async def lifespan(app: FastAPI):
    global estimator
    estimator = DensityEstimator(settings.mode, settings.hf_model_id, settings.hf_token, settings.hf_fallback_model_id)
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
        "task": "object-detection",
        "note": "person detection -> occupancy -> density normalised to people/m2",
    }


@app.post("/v1/density/estimate", response_model=DensityEstimateResponse)
async def density_estimate(req: DensityEstimateRequest) -> DensityEstimateResponse:
    if req.zone_id not in settings.zones:
        raise HTTPException(status_code=400, detail="Unknown zone_id")
    occupancy_hint = 0
    try:
        density, occ = await asyncio.to_thread(estimator.estimate, req.frame_ref, req.zone_id, occupancy_hint)
    except Exception as e:
        log.error("Inference failed for %s: %s", req.zone_id, e)
        raise HTTPException(status_code=500, detail="Inference processing error")
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
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Invalid file type. Please upload an image.")
    if gate_id not in settings.zones:
        raise HTTPException(status_code=400, detail="Unknown zone_id")

    await asyncio.sleep(0.15)
    frame_ref = file.filename or f"cctv:{gate_id}"
    try:
        _, estimated_crowd_size = await asyncio.to_thread(estimator.estimate, frame_ref, gate_id, random.randint(10, 120))
    except Exception as e:
        log.error("Inference failed for %s: %s", gate_id, e)
        raise HTTPException(status_code=500, detail="Inference processing error")
    return {
        "gate_id": gate_id,
        "status": "success",
        "model_used": f"HF/{estimator.hf_model_id}",
        "estimated_density": estimated_crowd_size,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.websocket("/api/v1/ws/live-inference")
async def live_inference_ws(websocket: WebSocket):
    await websocket.accept()
    simulator.live_mode = True
    log.info("Live inference WS connected, synthetic simulator paused.")
    zone_id = "GATE_A"  # Default zone for the live pitch
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            while True:
                try:
                    data = await websocket.receive_json()
                    event = data.get("event")
                except (ValueError, AttributeError) as e:
                    log.warning("Ignoring malformed live-inference message: %s", e)
                    continue
                if event == "frame":
                    frame_ref = data.get("data", "live_frame")
                    
                    try:
                        # 1. Run YOLO inference (uses the existing seam)
                        density, occ = await asyncio.to_thread(estimator.estimate, frame_ref, zone_id, 0)
                        
                        # 2. Package into TelemetryBatch
                        # Ensure we get the capacity right, fallback to 100
                        capacity = settings.zones.get(zone_id, (100, 50))[0]
                        batch = TelemetryBatch(zones=[
                            ZoneMetric(
                                zone_id=zone_id,
                                capacity=capacity,
                                density=density,
                                occupancy=occ,
                                congestion=estimator.classify(density),
                                inflow_rate=0.0,
                                outflow_rate=0.0,
                                timestamp=datetime.now(timezone.utc).isoformat(),
                            )
                        ])
                        
                        # 3. Emit to backend
                        if settings.emit_to_backend:
                            resp = await client.post(settings.emit_to_backend, json=batch.model_dump())
                            if resp.status_code not in (200, 202):
                                log.warning("Live batch rejected: HTTP %s", resp.status_code)
                            
                    except Exception as e:
                        log.error("Live inference frame processing failed: %s", e)

    except WebSocketDisconnect:
        log.info("Live inference WS disconnected, reverting to synthetic.")
    finally:
        simulator.live_mode = False
