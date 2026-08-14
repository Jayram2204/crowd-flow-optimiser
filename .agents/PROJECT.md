# Project: Crowd Flow Optimiser Test Suite

## Architecture
The crowd-flow-optimiser platform consists of three integrated subsystems:
1. **Frontend**: Next.js 15 App Router (React 19, Tailwind CSS v4, TypeScript 5) web interface delivering real-time crowd metrics, zone status cards, lead override controls, and WebSocket live feeds.
2. **Backend**: Go service managing autonomous agent negotiation, zone state management, real-time WebSocket/SSE broadcast streams, REST ingestion, and intervention dispatch.
3. **AI Telemetry**: Python FastAPI service with local YOLOv11 and HuggingFace computer vision inference, venue crowd simulation loop, and telemetry batch streaming to the Go backend.

## Feature Inventory
| # | Feature / Test Suite | Description | Milestone | Source |
|---|----------------------|-------------|-----------|--------|
| 1 | Frontend Test Setup | Configure Jest & React Testing Library for Next.js 15 & React 19 (`jest.config.ts`, `jest.setup.ts`, `package.json` test scripts) | M1 | Survey |
| 2 | Frontend API & WS Mocking | Unit tests for `lib/api.ts` (REST endpoints, AbortController timeouts, WebSocket frames, reconnect backoff, SSE) | M1 | Survey |
| 3 | Frontend Component Tests | Unit tests for UI components (`congestion.ts`, `TopBar.tsx`, `ZoneLead.tsx`, `ZoneRow.tsx`, `InterventionLog.tsx`, `LandingPage.tsx`) | M1 | Survey |
| 4 | Frontend Page Tests | Unit tests for `app/operate/page.tsx`, `app/page.tsx`, `app/layout.tsx` | M1 | Survey |
| 5 | Backend Config Tests | Unit tests for `internal/config` (`Load`, `env`, `splitCSV`, default & custom envs) | M2 | Survey |
| 6 | Backend Models Tests | Unit tests for `internal/models` (JSON roundtrip, omitempty rules, enum constants) | M2 | Survey |
| 7 | Backend WS & SSE Tests | Unit tests for `internal/api/ws.go` (handshake, snapshot, live broadcasts, disconnects, concurrent clients, reconnects) and `internal/api/handlers.go` (SSE, list zones, CORS) | M2 | Survey |
| 8 | Backend Server Lifecycle Tests | Unit tests for `cmd/server/main.go` and root package helper tests | M2 | Survey |
| 9 | Backend Data Race Fix | Eliminate data race in `internal/agent/network_test.go:TestNegotiateTimeout` | M2 | Survey |
| 10 | AI Telemetry Pytest & Coverage Setup | Install `pytest-cov`, `pytest-asyncio`, create `pytest.ini` with coverage options | M3 | Survey |
| 11 | AI Telemetry Regression Fix | Fix 400 vs 500 status assertion in `tests/test_api.py:test_density_estimate_unknown_zone` | M3 | Survey |
| 12 | AI Telemetry Simulation Loop Tests | Integration tests for `app/services/simulator.py` (`_build_batch`, `run_forever`, resilience, frame increment) | M3 | Survey |
| 13 | AI Telemetry VenueScenario Tests | Unit tests for `VenueScenario` crowd dynamics, surge window, inflow/outflow, and relaxation | M3 | Survey |
| 14 | AI Telemetry Live Pipeline Tests | Integration tests for live CV pipeline, YOLO/transformers fallback, multipart upload, caching | M3 | Survey |
| 15 | Cross-Subsystem E2E Verification | Run full test commands across all 3 subsystems simultaneously (`npm run test`, `go test ./...`, `pytest`) | M4 | Survey |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Frontend Test Suite | Jest/RTL setup, unit tests for components, lib/api.ts, pages; `cd frontend && npm run test` passes 100% | none | DONE |
| M2 | Backend Test Suite | Go unit tests for config, models, ws.go, handlers, server lifecycle, race fix; `cd backend && go test -race ./...` passes 100% | none | DONE |
| M3 | AI Telemetry Test Suite | Pytest & pytest-cov setup, simulator integration tests, VenueScenario tests, live pipeline tests, API fixes; `cd ai-telemetry && pytest` passes 100% with coverage | none | DONE |
| M4 | Final Verification & Audit | Multi-tier review, challenger adversarial checks, and forensic audit across all 3 test suites | M1, M2, M3 | DONE |

## Interface Contracts

### 1. Telemetry Ingestion Contract: AI Telemetry -> Go Backend
- **Endpoint**: `POST /api/v1/telemetry`
- **Request Format**:
  ```json
  {
    "zones": [
      {
        "zone_id": "GATE_A",
        "capacity": 100,
        "density": 0.85,
        "occupancy": 85,
        "congestion": "HIGH",
        "inflow_rate": 12.0,
        "outflow_rate": 4.0,
        "timestamp": "2026-08-14T06:00:00Z",
        "offline": false
      }
    ]
  }
  ```
- **Response**: `202 Accepted` -> `{"accepted": 1, "status": "ingested"}`

### 2. WebSocket Real-time Stream Contract: Go Backend -> Frontend
- **Endpoint**: `GET /api/v1/ws` (WebSocket Upgrade)
- **Metric Envelope**: `{"event": "metric", "data": { ... ZoneMetric ... }}`
- **Intervention Envelope**: `{"event": "intervention", "data": { ... Intervention ... }}`
- **Heartbeat**: Ping frame every 20s from server, ping every 15s from client with 5s pong timeout.

### 3. Intervention Control Contract: Frontend -> Go Backend
- **Endpoint**: `POST /api/v1/interventions`
- **Request Format**: `{"zone_id": "GATE_A", "type": "SIGNAGE_REROUTE", "message": "..."}`
- **Response**: `201 Created` -> JSON Intervention representation

## Code Layout
- `frontend/`:
  - `jest.config.ts`, `jest.setup.ts`, `package.json`
  - `__tests__/lib/api.test.ts`
  - `__tests__/components/congestion.test.ts`
  - `__tests__/components/TopBar.test.tsx`
  - `__tests__/components/ZoneLead.test.tsx`
  - `__tests__/components/ZoneRow.test.tsx`
  - `__tests__/components/InterventionLog.test.tsx`
  - `__tests__/components/LandingPage.test.tsx`
  - `__tests__/app/OperatePage.test.tsx`
  - `__tests__/app/PageRoutes.test.tsx`
- `backend/`:
  - `internal/config/config_test.go`
  - `internal/models/models_test.go`
  - `internal/api/ws_test.go`
  - `internal/api/handlers_test.go`
  - `cmd/server/main_test.go`
  - `main_test.go`
  - `internal/agent/network_test.go`
- `ai-telemetry/`:
  - `pytest.ini`, `requirements.txt`
  - `tests/test_api.py`
  - `tests/test_simulator.py`
  - `tests/test_venue_scenario.py`
  - `tests/test_live_pipeline.py`
