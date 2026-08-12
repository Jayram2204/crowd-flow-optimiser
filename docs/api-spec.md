# API Specification

Base URLs:

| Service | URL | Docs |
| --- | --- | --- |
| Go Backend | `http://localhost:8080` | this file |
| AI Telemetry | `http://localhost:8000` | `http://localhost:8000/docs` (auto OpenAPI) |
| Frontend | `http://localhost:3000` | — |

All backend payloads are JSON. Content-Type: `application/json`.

---

## Backend — Crowd Flow Optimiser

### `GET /healthz`

Liveness probe.

```json
{ "service": "crowd-flow-optimiser-backend", "status": "ok", "time": "2026-08-12T00:00:00Z" }
```

### `GET /api/v1/zones`

Snapshot of the latest metric for every zone.

```json
{
  "zones": [
    {
      "zone_id": "GATE_A",
      "capacity": 120,
      "density": 0.94,
      "occupancy": 122,
      "congestion": "CRITICAL",
      "inflow_rate": 41.6,
      "outflow_rate": 3.1,
      "timestamp": "2026-08-12T00:00:00Z"
    }
  ]
}
```

`congestion` ∈ `LOW | MODERATE | HIGH | CRITICAL`.

### `GET /api/v1/zones/{zone}`

Latest metric for a single zone. `404` for unknown zones.

### `POST /api/v1/telemetry`

Bulk ingest endpoint used by the AI telemetry layer. Accepts `202`.

```json
{
  "zones": [
    {
      "zone_id": "GATE_A",
      "capacity": 120,
      "density": 0.94,
      "occupancy": 122,
      "congestion": "CRITICAL",
      "inflow_rate": 41.6,
      "outflow_rate": 3.1
    }
  ]
}
```

Semantics: metrics are recorded to the State Manager immediately; the owning
zone agent is notified asynchronously and may trigger negotiations.

### `GET /api/v1/stream`

Server-Sent Events. Emits a `snapshot` event per zone on connect, then a
`metric` event per zone update. Heartbeat comment every 15s.

```
event: snapshot
data: {"zone_id":"GATE_A","capacity":120,...}

event: metric
data: {"zone_id":"GATE_A","capacity":120,...}
```

### `GET /api/v1/interventions`

Full intervention audit trail, newest first.

```json
{
  "interventions": [
    {
      "id": "iv-1752350000000000000",
      "zone_id": "GATE_A",
      "type": "SIGNAGE_REROUTE",
      "message": "GATE_A rerouted overflow (24 ppl) to GATE_B :: GATE_B absorbing 24 ppl from GATE_A (spare=28)",
      "severity": "HIGH",
      "target_zone": "GATE_B",
      "applied_at": "2026-08-12T00:00:00Z"
    }
  ]
}
```

`type` ∈ `SIGNAGE_REROUTE | HOLD_INFLOW | DYNAMIC_SHUTTLE | DISPATCH_STAFF`.

### `POST /api/v1/interventions`

Operator-forced physical intervention (the signage API call).

Request:

```json
{
  "zone_id": "GATE_A",
  "type": "SIGNAGE_REROUTE",
  "message": "MANUAL OVERRIDE: operator forced signage reroute"
}
```

Response: `201` with the enriched intervention (ID + timestamp).

---

## AI Telemetry Layer

### `GET /healthz`

```json
{ "service": "cfo-ai-telemetry", "status": "ok", "mode": "simulated" }
```

### `GET /v1/models`

Vision model + mode introspection.

### `POST /v1/density/estimate`

Per-frame density estimation seam (the HF model boundary).

```json
{
  "frame_ref": "cctv:1234",
  "zone_id": "GATE_A"
}
```

```json
{
  "zone_id": "GATE_A",
  "density": 0.94,
  "occupancy": 122,
  "congestion": "CRITICAL",
  "model": "csrnet-pytorch",
  "mode": "simulated",
  "frame_ref": "cctv:1234"
}
```

---

## Configuration reference

| Env var | Default | Purpose |
| --- | --- | --- |
| `BACKEND_HTTP_ADDR` | `:8080` | Backend listen address |
| `BACKEND_ZONE_TOPOLOGY` | comma-separated zone list | Venue topology; adjacency derived from order |
| `AI_HTTP_ADDR` | `0.0.0.0:8000` | Telemetry layer listen address |
| `AI_EMIT_TO_BACKEND` | `http://localhost:8080/api/v1/telemetry` | Where telemetry is pushed |
| `AI_SIM_LOOP_INTERVAL_SECONDS` | `2` | Telemetry emit cadence |
| `AI_MODE` | `simulated` | `simulated` or `live` HF inference |
| `AI_HF_MODEL_ID` | `csrnet-pytorch` | HF model identifier |
| `HF_TOKEN` | — | Required only for `AI_MODE=live` |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8080` | Backend base URL for the UI |
