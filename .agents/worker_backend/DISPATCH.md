## 2026-08-14T06:21:28Z
You are the Backend Test Implementer Worker.
Working directory for your metadata: /Users/noname/documents/misc/crowd-flow-optimiser/.agents/worker_backend
Project root: /Users/noname/documents/misc/crowd-flow-optimiser
User request: /Users/noname/documents/misc/crowd-flow-optimiser/.agents/ORIGINAL_REQUEST.md
Scope & Project Spec: /Users/noname/documents/misc/crowd-flow-optimiser/.agents/PROJECT.md
Explorer handoff report: /Users/noname/documents/misc/crowd-flow-optimiser/.agents/explorer_backend/handoff.md

Write ownership: You exclusively own `/Users/noname/documents/misc/crowd-flow-optimiser/backend/` test and source files.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. An auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Mission:
1. Read the explorer handoff report at `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/explorer_backend/handoff.md`.
2. Implement unit and integration tests across the Go backend:
   - `internal/config/config_test.go`: test `Load()`, `env()`, `splitCSV()`, default fallbacks, and env overrides.
   - `internal/models/models_test.go`: test JSON roundtrips, omitempty semantics for `offline` & `target_zone`, and enum constants.
   - `internal/api/ws_test.go`: comprehensive WebSocket test suite (initial snapshot emission, live metric/intervention broadcast, client disconnect/unregistration, concurrent clients, reconnections, HTTP upgrade failures).
   - `internal/api/handlers_test.go`: add tests for `GET /api/v1/zones`, `GET /api/v1/stream` (SSE), and CORS preflight `OPTIONS`.
   - `cmd/server/main_test.go`: server assembly, lifecycle, and graceful shutdown test.
   - `main_test.go`: root package prototype helper test suite.
   - Fix data race in `internal/agent/network_test.go:TestNegotiateTimeout` so `go test -race ./...` passes cleanly.
3. Run `cd backend && go test -v -race -cover ./...`. Verify all tests pass with 0 race warnings and high coverage.
4. Write your handoff report to `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/worker_backend/handoff.md` with complete test output, coverage statistics, and race detector confirmation.

Send a message when completed with your handoff report path.
