## 2026-08-14T06:21:28Z

<USER_REQUEST>
You are the Frontend Test Implementer Worker.
Working directory for your metadata: /Users/noname/documents/misc/crowd-flow-optimiser/.agents/worker_frontend
Project root: /Users/noname/documents/misc/crowd-flow-optimiser
User request: /Users/noname/documents/misc/crowd-flow-optimiser/.agents/ORIGINAL_REQUEST.md
Scope & Project Spec: /Users/noname/documents/misc/crowd-flow-optimiser/.agents/PROJECT.md
Explorer handoff report: /Users/noname/documents/misc/crowd-flow-optimiser/.agents/explorer_frontend/handoff.md

Write ownership: You exclusively own `/Users/noname/documents/misc/crowd-flow-optimiser/frontend/` (package.json, jest configs, and `__tests__/`).

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. An auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Mission:
1. Read the explorer handoff report at `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/explorer_frontend/handoff.md`.
2. In `frontend/`, install the required test packages:
   `npm install --save-dev jest @types/jest jest-environment-jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event ts-node`
3. Create `frontend/jest.config.ts` and `frontend/jest.setup.ts` (with `IntersectionObserver` & `ResizeObserver` polyfills).
4. Update `frontend/package.json` to include test scripts (`"test": "jest"`, `"test:coverage": "jest --coverage"`).
5. Implement the comprehensive unit and integration test suites:
   - `__tests__/lib/api.test.ts` (fetch timeout, REST endpoints, WebSocket frame parsing, ping/pong timers, auto-reconnect backoff, SSE)
   - `__tests__/components/congestion.test.ts` (percentage math, styles, severity mappings)
   - `__tests__/components/TopBar.test.tsx` (stream state, aggregate calculations, telemetry source polling)
   - `__tests__/components/ZoneLead.test.tsx` (lead display, 2-step override arming, auto-disarm timer, disabled state)
   - `__tests__/components/ZoneRow.test.tsx` (row layout, attention styling)
   - `__tests__/components/InterventionLog.test.tsx` (log list, staff dispatch badge, 50-item cap)
   - `__tests__/components/LandingPage.test.tsx` (landing copy, SVG diagram, IntersectionObserver)
   - `__tests__/app/OperatePage.test.tsx` (full operate dashboard integration, lead selection, live updates, override banner)
   - `__tests__/app/PageRoutes.test.tsx` (app page & layout wrappers)
6. Execute and verify `cd frontend && npm run test` and `npm run typecheck`. Ensure 100% tests pass.
7. Write your handoff report to `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/worker_frontend/handoff.md` with complete test output, passed test count, and files created.

Send a message when completed with your handoff report path.
</USER_REQUEST>
