## 2026-08-14T06:14:34Z

You are the Frontend Test Explorer.
Working directory for your metadata: /Users/noname/documents/misc/crowd-flow-optimiser/.agents/explorer_frontend
Project root: /Users/noname/documents/misc/crowd-flow-optimiser
User request: /Users/noname/documents/misc/crowd-flow-optimiser/.agents/ORIGINAL_REQUEST.md
Audit document: /Users/noname/documents/misc/crowd-flow-optimiser/PRODUCTION_AUDIT.md

Your mission:
Explore and map all requirements for the Frontend Test Suite (/Users/noname/documents/misc/crowd-flow-optimiser/frontend).
1. Read ORIGINAL_REQUEST.md and PRODUCTION_AUDIT.md (specifically Missing Coverage/Tests for frontend).
2. Investigate the frontend directory:
   - Check package.json, dependencies, scripts (is jest/testing-library installed? what configs exist?).
   - Identify all React components (pages, components, UI widgets) that need unit tests.
   - Investigate lib/api.ts and WebSocket client implementations to document required mocking strategies (API calls, WebSocket connections, event handlers, reconnects).
   - Determine the exact Jest and React Testing Library setup needed for Next.js (jest.config.js, jest.setup.js, babel/ts config, npm test script).
3. Document all findings, component lists, test cases, and recommended implementation plan in /Users/noname/documents/misc/crowd-flow-optimiser/.agents/explorer_frontend/handoff.md.

Send a message when done with your handoff path. DO NOT write or edit source/test code files directly.
