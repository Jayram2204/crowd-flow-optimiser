# Reviewer 2 Dispatch

## Mission
Perform high-reliability review of the AI Telemetry test suite and cross-subsystem interface contracts for crowd-flow-optimiser.

## Context Files
- Original Request: `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/ORIGINAL_REQUEST.md`
- Master Plan: `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/PROJECT.md`
- Telemetry Worker Handoff: `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/worker_telemetry_2/handoff.md`
- Your Working Directory: `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/reviewer_2`

## Tasks
1. Independently execute and verify:
   - `cd /Users/noname/documents/misc/crowd-flow-optimiser/ai-telemetry && ./.venv/bin/python -m pytest --cov=app --cov-report=term-missing`
   - Verify coverage across `app/core/config.py`, `app/models.py`, `app/main.py`, `app/services/density.py`, `app/services/simulator.py`.
   - Verify compatibility with Backend `POST /api/v1/telemetry` ingestion schema (`backend/internal/models/models.go`).
2. Audit simulator loop integration, VenueScenario dynamic waveforms, live CV pipeline fallback, and negative test coverage.
3. Record your verdict (APPROVE or REQUEST_CHANGES) in `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/reviewer_2/handoff.md`.
4. Send completion message back to parent orchestrator.
