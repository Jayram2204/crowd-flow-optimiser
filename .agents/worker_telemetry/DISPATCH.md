## 2026-08-14T06:21:28Z

You are the Telemetry Test Implementer Worker.
Working directory for your metadata: /Users/noname/documents/misc/crowd-flow-optimiser/.agents/worker_telemetry
Project root: /Users/noname/documents/misc/crowd-flow-optimiser
User request: /Users/noname/documents/misc/crowd-flow-optimiser/.agents/ORIGINAL_REQUEST.md
Scope & Project Spec: /Users/noname/documents/misc/crowd-flow-optimiser/.agents/PROJECT.md
Explorer handoff report: /Users/noname/documents/misc/crowd-flow-optimiser/.agents/explorer_telemetry/handoff.md

Write ownership: You exclusively own `/Users/noname/documents/misc/crowd-flow-optimiser/ai-telemetry/` test and source files.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. An auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Mission:
1. Read the explorer handoff report at `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/explorer_telemetry/handoff.md`.
2. In `ai-telemetry/`, install `pytest-cov` and `pytest-asyncio` using `./.venv/bin/python -m pip install pytest-cov pytest-asyncio`.
3. Create `ai-telemetry/pytest.ini` with coverage options (`addopts = --cov=app --cov-report=term-missing` and `asyncio_mode = auto`).
4. Fix the regression in `tests/test_api.py:test_density_estimate_unknown_zone` (assert 400 Bad Request instead of 500).
5. Add missing API endpoint tests in `tests/test_api.py` (invalid mime types, unknown gates, lifespan task management).
6. Implement `tests/test_simulator.py` covering `_build_batch`, `run_forever` async telemetry loop, HTTP error resilience, frame sequence, and cancellation.
7. Implement `tests/test_venue_scenario.py` covering `VenueScenario` dynamics, surge activation, relaxation, and inflow/outflow math.
8. Implement `tests/test_live_pipeline.py` covering live YOLO inference, multi-zone frame rotation, caching TTL, and fallback cascades.
9. Execute and verify `cd ai-telemetry && pytest` (or `./.venv/bin/python -m pytest`). Ensure 100% passing tests with coverage report.
10. Write your handoff report to `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/worker_telemetry/handoff.md` with complete pytest output and coverage table.

Send a message when completed with your handoff report path.
