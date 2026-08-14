# BRIEFING — 2026-08-14T06:20:00Z

## Mission
Explore and map all requirements for the AI Telemetry Test Suite (`ai-telemetry`), covering simulation loop, live-mode execution pipeline, environment, dependencies, pytest/pytest-cov setup, and integration test scenarios.

## 🔒 My Identity
- Archetype: explorer
- Roles: [explorer, analyst]
- Working directory: /Users/noname/documents/misc/crowd-flow-optimiser/.agents/explorer_telemetry
- Original parent: 92ccafcc-d647-48a3-9351-7a65a2269400
- Milestone: AI Telemetry Test Suite Exploration

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or modify source/test code files directly
- Metadata written only to /Users/noname/documents/misc/crowd-flow-optimiser/.agents/explorer_telemetry/
- Output complete 5-component handoff report

## Current Parent
- Conversation ID: 92ccafcc-d647-48a3-9351-7a65a2269400
- Updated: 2026-08-14T06:20:00Z

## Investigation State
- **Explored paths**:
  - `ai-telemetry/requirements.txt`, `Dockerfile`, `.venv` package inventory
  - `app/core/config.py`, `app/models.py`, `app/main.py`
  - `app/services/density.py`, `app/services/simulator.py`
  - `tests/conftest.py`, `tests/test_api.py`, `tests/test_config.py`, `tests/test_density.py`, `tests/test_models.py`
  - `data/frames/` (5 JPEG sample frames), `data/weights/` (`yolo11n.pt`)
  - `backend/internal/api/handlers.go`, `backend/internal/models/models.go` (Go telemetry ingestion contract)
- **Key findings**:
  1. `pytest-cov` and `coverage` are not installed in the `.venv`; no `pytest.ini` exists.
  2. Test failure in `tests/test_api.py:48` (`test_density_estimate_unknown_zone` expects 500, but API returns 400 Bad Request).
  3. `app/services/simulator.py` is 100% untested (0 tests for `_build_batch` or `run_forever`).
  4. `VenueScenario` in `app/services/density.py` has 0 direct tests for its simulation math (tick, surges, waves, inflow/outflow).
  5. Live inference pipeline with bundled `yolo11n.pt` was verified to work locally on `data/frames/bandra.jpg`.
  6. Python `pip` shebang has stale directory path; running `./.venv/bin/python -m pip` works properly.
- **Unexplored areas**: None. Exploration complete.

## Key Decisions Made
- Mapped all integration test scenarios for simulation loop and live-mode execution pipeline.
- Defined exact pytest and coverage configuration specification (`pytest.ini` with `--cov=app --cov-report=term-missing`).
- Defined recommended implementation plan and verification criteria for implementer.

## Artifact Index
- /Users/noname/documents/misc/crowd-flow-optimiser/.agents/explorer_telemetry/DISPATCH.md — Task dispatch log
- /Users/noname/documents/misc/crowd-flow-optimiser/.agents/explorer_telemetry/BRIEFING.md — Persistent working memory
- /Users/noname/documents/misc/crowd-flow-optimiser/.agents/explorer_telemetry/progress.md — Liveness heartbeat
- /Users/noname/documents/misc/crowd-flow-optimiser/.agents/explorer_telemetry/handoff.md — Final investigation handoff report
