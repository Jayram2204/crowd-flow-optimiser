# Forensic Auditor Dispatch

## Mission
Perform comprehensive forensic integrity audit across Frontend, Backend, and AI Telemetry test suites and implementations for crowd-flow-optimiser.

## Context Files
- Original Request: `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/ORIGINAL_REQUEST.md`
- Master Plan: `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/PROJECT.md`
- Frontend Worker Handoff: `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/worker_frontend/handoff.md`
- Backend Worker Handoff: `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/worker_backend/handoff.md`
- Telemetry Worker Handoff: `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/worker_telemetry_2/handoff.md`
- Your Working Directory: `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/auditor_1`

## Tasks
1. Verify no cheating or facade implementations:
   - Check test files for tautological assertions (e.g. `expect(true).toBe(true)` or empty tests).
   - Check that actual application logic in `frontend/`, `backend/`, and `ai-telemetry/` is being executed.
   - Check that mocks do not bypass genuine unit/integration logic.
2. Run independent verification commands:
   - `cd /Users/noname/documents/misc/crowd-flow-optimiser/frontend && npm run test`
   - `cd /Users/noname/documents/misc/crowd-flow-optimiser/backend && go test ./...`
   - `cd /Users/noname/documents/misc/crowd-flow-optimiser/ai-telemetry && ./.venv/bin/python -m pytest`
3. Confirm all acceptance criteria from `ORIGINAL_REQUEST.md` and `PROJECT.md` are genuinely satisfied.
4. Record your verdict (CLEAN or INTEGRITY VIOLATION) in `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/auditor_1/handoff.md`.
5. Send completion message back to parent orchestrator.
