## 2026-08-14T06:14:34Z
You are the Backend Test Explorer.
Working directory for your metadata: /Users/noname/documents/misc/crowd-flow-optimiser/.agents/explorer_backend
Project root: /Users/noname/documents/misc/crowd-flow-optimiser
User request: /Users/noname/documents/misc/crowd-flow-optimiser/.agents/ORIGINAL_REQUEST.md
Audit document: /Users/noname/documents/misc/crowd-flow-optimiser/PRODUCTION_AUDIT.md

Your mission:
Explore and map all requirements for the Backend Go Test Suite (/Users/noname/documents/misc/crowd-flow-optimiser/backend).
1. Read ORIGINAL_REQUEST.md and PRODUCTION_AUDIT.md (specifically Missing Coverage/Tests for backend).
2. Investigate the backend directory:
   - Check go.mod, Go version, dependencies.
   - Investigate `internal/config`, `internal/models`, `cmd/server`, and `internal/api/ws.go`.
   - Identify edge cases for WebSocket stream handling, client registration/unregistration, broadcast channels, reconnections, error handling, concurrent access.
   - Determine how `go test ./...` can be structured and what test helper utilities or mock WebSocket clients/servers are needed.
3. Document all findings, function/module inventories, test case matrices, and recommended implementation plan in /Users/noname/documents/misc/crowd-flow-optimiser/.agents/explorer_backend/handoff.md.

Send a message when done with your handoff path. DO NOT write or edit source/test code files directly.
