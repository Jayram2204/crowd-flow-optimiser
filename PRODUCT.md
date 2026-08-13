# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Existing codebase (not greenfield):
- `frontend/` — Next.js 15 (App Router) + React 19 + Tailwind v4, served on :3001 in local dev.
- `backend/` — Go 1.22+, stdlib HTTP + `gorilla/websocket`, one autonomous goroutine per zone agent.
- `ai-telemetry/` — Python/FastAPI vision seam that normalises model output into the backend telemetry contract (`POST /api/v1/telemetry`), runs on :8000.
- Local dev wiring: Go backend :8080, emitter → backend, frontend → backend (WS `/api/v1/ws`, REST `/api/v1/*`).

## Users

- Primary user: **venue control-room operator** stationed at a terminal or wall display during a live event. Their job under time pressure is to (1) spot the zone(s) currently at critical density and (2) confirm the autonomous agent network is already acting on them — negotiation and signage reroute executing without operator intervention. Secondary, lighter use: a floor supervisor glancing at the same surface from a tablet while walking the venue.
- The operator trusts the machine to act, and scans the screen to confirm action. The UI must never make them hunt for the critical zone or question whether the system is responding.

## Product Purpose

A decentralized, multi-agent crowd-safety system for transit/venue interchanges. Zones (GATE_A, GATE_B, CONCOURSE_A, BAG_CHECK, E_PIER, PLATFORM_1/2, SECURITY_T1/T2) run as independent Go goroutines that read their own density, negotiate overflow peer-to-peer over channels, and execute physical interventions (signage reroute, hold inflow, staff dispatch). Success = the critical zone is found instantly, the system's autonomous response is legible in real time, and the operator can force an override when needed. The thesis: **"we execute, we don't just watch."**

## Positioning

The mechanism a neighbouring product could not truthfully copy: no central simulation. Every zone is its own decision-maker; congestion is resolved by direct peer negotiation (channels, sub-millisecond), and every accepted negotiation becomes a recorded physical intervention. It is an action layer ("last mile"), not a monitoring mirror.

## Operating Context

- Control-room/operator station or wall display as the primary context: desktop/large-display first, minimal tablet fallback for the walking supervisor, no phone version.
- Live event with continuously changing telemetry (~2s emit cadence). Operator holds no direct visibility into the negotiation internals; the surface is the proof of what the agents decided.
- The demo data path is real inference on **synthetic input**: static/looped test footage through a Hugging Face density model. There is no live venue camera. This is stated plainly as a strength in the UI, never disguised.
- Local dev command for the frontend is `npm run dev`; the full stack runs via `docker compose` (see README) or three local processes (emitter / backend / frontend).

## Capabilities and Constraints

- 9 zones with ordered topology; adjacency (who may negotiate with whom) is derived from zone ordering.
- REST: `GET /api/v1/zones`, `GET /api/v1/zones/{zone}`, `GET/POST /api/v1/interventions`, `GET /healthz`; live streaming over WS `/api/v1/ws` (primary) and SSE `/api/v1/stream` (fallback); telemetry ingest `POST /api/v1/telemetry`.
- Interventions are **fully autonomous** with a manual operator override (`FORCE REROUTE`). Staff-dispatch interventions require operator confirmation and deserve a distinct, quieter visual treatment — never competing with the authored reroute moment.
- Constraint (recorded, not yet implemented): the live HF inference path is a stub. `ai-telemetry/app/services/density.py:_live_estimate` raises `NotImplementedError`; the pipeline task is wired as `image-classification` (wrong for a CSRNet-style density model); `transformers`/`torch` are not installed; no sample footage and no HF token exist on the dev machine. Today the emitter actually runs `AI_MODE=simulated` (synthetic scenario generator). **UI copy must never claim "simulated" or "live CCTV" — it states the real source: live model inference on synthetic input, or the honest current state until that path is implemented.**
- No data store/broker: in-memory state, single-process Go backend. Fine for the demo scope.

## Brand Commitments

- Product name: **CROWD_FLOW // OPTIMISER** (established header lockup, already in ALL CAPS as the UI convention). No other ALL CAPS beyond established header conventions.
- Visual voice is binding: industrial / Swiss-editorial, monospace throughout, sentence case, hairline dividers, restrained near-monochrome color with a single accent reserved for the zone that needs attention right now, asymmetric layout, no particles / no glow / no rendered scenes. Visitor mode is **Operate** and must persist.
- Motion discipline: feedback-only transitions; the single authored focal moment is the autonomous signage-reroute execution (log line landing + affected zone responding, 300–500ms, natural deceleration, no bounce/elastic); no idle motion on nominal zones; every transition has a `prefers-reduced-motion` path.

## Evidence on Hand

- `README.md`, `PROFILE_README.md`, `docs/architecture.md`, `docs/api-spec.md` — architecture and API contract.
- Live simulated telemetry from the emitter against the running stack (verified: all 9 zones populate; gate cluster surges to CRITICAL and negotiates).
- No real venue data, no customer footage, no testimonials. Do not fabricate any of these.

## Product Principles

1. Legibility outranks expression: an operator under pressure reads the critical zone first, the ranked field second, the execution log third.
2. Show the decision and the execution, not the mechanics: the UI surfaces autonomous action and manual override, not simulation internals.
3. Equal weight is the failure mode: the critical zone earns outsized typographic weight; everything nominal stays quiet and dense.
4. Autonomy is the product: the system acts, the operator confirms and overrides. The interface must make "it is already acting" unmistakable.
5. Truthful telemetry labeling: real inference on synthetic input is stated plainly as a strength, never hidden and never overstated.

## Accessibility & Inclusion

- High-contrast dark terminal surface; color is never the only signal for congestion state (always paired with text/level labels).
- `prefers-reduced-motion` support for every transition; state changes stay legible without spatial movement.
- Dense desktop-first layout with a tablet fallback that reorders to a fixed stack (critical zone first, log second, full list third) rather than proportional shrinking.
