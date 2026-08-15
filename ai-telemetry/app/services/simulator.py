import asyncio
import logging
from datetime import datetime, timezone
from typing import List

import httpx

from app.core.config import settings
from app.models import TelemetryBatch, ZoneMetric
from app.services.density import DensityEstimator, VenueScenario

log = logging.getLogger("cfo.simulator")

_frames = 0
live_mode = False

async def run_forever(estimator: DensityEstimator) -> None:
    """Telemetry emission loop. Each tick fuses the scenario with the vision
    seam and POSTs a batch to the Go agent network."""
    scenario = VenueScenario(settings.zones)
    global _frames
    global live_mode

    async with httpx.AsyncClient(timeout=5.0) as client:
        while True:
            if live_mode:
                await asyncio.sleep(1.0)
                continue

            _frames += 1
            frame_ref = f"cctv:{_frames}"
            batch = await _build_batch(estimator, scenario, frame_ref)
            log.info("emit frame=%s zones=%d", frame_ref, len(batch.zones))
            try:
                resp = await client.post(settings.emit_to_backend, json=batch.model_dump())
                if resp.status_code not in (200, 202):
                    log.warning("backend rejected batch: HTTP %s %s", resp.status_code, resp.text[:200])
            except httpx.HTTPError as exc:
                log.warning("backend unreachable (%s); retrying next tick", exc)
            await asyncio.sleep(settings.sim_loop_seconds)


async def _build_batch(estimator: DensityEstimator, scenario: VenueScenario, frame_ref: str) -> TelemetryBatch:
    zones: List[ZoneMetric] = []
    for zid, occ, inflow, outflow in scenario.tick():
        density, occ_est = await asyncio.to_thread(estimator.estimate, frame_ref, zid, occ)
        congestion = estimator.classify(density)
        zones.append(
            ZoneMetric(
                zone_id=zid,
                capacity=settings.zones[zid][0],
                density=density,
                occupancy=occ_est,
                congestion=congestion,
                inflow_rate=inflow,
                outflow_rate=outflow,
                timestamp=datetime.now(timezone.utc).isoformat(),
            )
        )
    return TelemetryBatch(zones=zones)
