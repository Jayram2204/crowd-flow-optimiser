# Dispatch Instructions for Telemetry Worker

## Mission
Implement the AI Telemetry test suite and coverage configuration in `/Users/noname/documents/misc/crowd-flow-optimiser/ai-telemetry` so that running `pytest` passes 100% with comprehensive coverage across all modules (`app/core/config.py`, `app/models.py`, `app/main.py`, `app/services/density.py`, `app/services/simulator.py`).

## Inputs & Context
- Original Request: `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/ORIGINAL_REQUEST.md`
- Master Plan: `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/PROJECT.md`
- Explorer Report: `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/explorer_telemetry/handoff.md`
- Working Directory: `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/worker_telemetry_2`
- Service Directory: `/Users/noname/documents/misc/crowd-flow-optimiser/ai-telemetry`

## Detailed Tasks
1. Virtual Environment & Dependencies:
   - Note: `.venv/bin/pip` has a stale shebang; invoke via `./.venv/bin/python -m pip install pytest-cov pytest-asyncio`.
   - Update `requirements.txt` to include `pytest-cov` and `pytest-asyncio`.
2. Pytest Configuration:
   - Create `pytest.ini` with:
     ```ini
     [pytest]
     testpaths = tests
     python_files = test_*.py
     python_classes = Test*
     python_functions = test_*
     addopts = --cov=app --cov-report=term-missing
     asyncio_mode = auto
     ```
3. Fix & Expand API Tests (`tests/test_api.py`):
   - Fix `test_density_estimate_unknown_zone` to assert `status_code == 400` matching `app/main.py:62-63`.
   - Add negative tests: invalid MIME type on `/api/v1/analyze-density`, unknown gate_id, inference failure handling.
4. Implement Simulator Tests (`tests/test_simulator.py`):
   - Test `_build_batch` (schema validation, capacity mapping, density/congestion calculation, UTC ISO timestamp).
   - Test `run_forever` (emissions to backend, monotonic frame increment, 200/202 responses, 400/500 backend handling, `httpx.ConnectError`/`TimeoutException` resilience, clean cancellation on `asyncio.CancelledError`).
   - Mock `time.sleep` and `settings.sim_loop_seconds` for fast test execution.
5. Implement VenueScenario Tests (`tests/test_venue_scenario.py`):
   - Initial occupancy distribution (25-45% of capacity).
   - Tick phase advancement (0.25 increment).
   - Surge dynamics (`4 < phase % 10 < 6`, gate cluster vs non-gate targets).
   - Inflow/outflow calculations and non-negative occupancy constraints.
6. Implement Live Pipeline Tests (`tests/test_live_pipeline.py`):
   - Live inference with `data/weights/yolo11n.pt` and `data/frames/bandra.jpg`.
   - Multi-zone frame rotation and 8.0s cache verification.
   - Fallback hierarchy (YOLO -> Transformers -> Simulated).
   - Multipart upload on `POST /api/v1/analyze-density`.
7. Verify and Report:
   - Run `pytest` / `./.venv/bin/python -m pytest --cov=app --cov-report=term-missing` and ensure 100% pass and >90% coverage.
   - Write full results to `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/worker_telemetry_2/handoff.md`.
   - Send completion message to parent orchestrator.

## Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.
