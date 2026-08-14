# Original User Request

## Initial Request — 2026-08-14T06:14:10Z

User Goal:
Resolve the "Missing Coverage/Tests" section of the PRODUCTION_AUDIT.md for the crowd-flow-optimiser project by implementing comprehensive test suites across the frontend, backend, and AI telemetry services.

Requirements:
1. Frontend Tests: Setup Jest and React Testing Library in Next.js frontend (/Users/noname/documents/misc/crowd-flow-optimiser/frontend). Write unit tests for React components and lib/api.ts. Ensure all API calls and WebSocket connections are properly mocked. `cd frontend && npm run test` must pass.
2. Backend Tests: Write Go unit tests for internal/config, internal/models, cmd/server, and WebSocket stream handling in internal/api/ws.go in backend (/Users/noname/documents/misc/crowd-flow-optimiser/backend). Ensure WebSocket reconnections and edge cases are covered. `cd backend && go test ./...` must pass.
3. Telemetry Tests: Setup pytest with pytest-cov in ai-telemetry (/Users/noname/documents/misc/crowd-flow-optimiser/ai-telemetry). Write integration tests for telemetry simulation loop (app/services/simulator.py) and live-mode execution pipeline. `cd ai-telemetry && pytest` must pass with coverage reporting.

Spawn specialized subagents to work on these tasks in parallel, monitor their progress, verify test execution and pass rates, fix any failures, maintain progress.md, and send completion message when all acceptance criteria are met.
