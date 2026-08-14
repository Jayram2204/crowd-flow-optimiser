---
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
p2_count: 1
timestamp: 2026-08-13T08-21-07Z
slug: frontend-app-page-tsx
---
# Critique — Crowd Flow Optimiser layout (`frontend/app/page.tsx` + zone/log components)

> Method: dual-agent, isolated. **A** — design review (Nielsen ×10, cognitive-load checklist, emotional journey, persona red flags) · **B** — detector + evidence (bundled static regex engine; control sample confirmed the engine fires; browser-rendered pass skipped — no browser automation in this environment). Design Health Score: **26/40**.

## Design Specificity verdict

Grounded at the surface, unwired at the interaction layer. The composition honestly encodes product facts: venue-adjacency ordering, the extracted lead vs. stable ranked field, autonomous-vs-operator log distinction, and a truthful telemetry source. But the product's defining interaction — the operator confirming *the autonomous network is already acting* — is not composed anywhere, and its data path is broken: the WS fan-out carries only `ZoneMetric` frames, so live autonomous interventions never reach the log. The log is therefore a record of operator actions plus a stale REST snapshot. The most important moment is not just undifferentiated — it's unwired.

## What's working

- **Stable field, emphasis-only encoding** — rows never reorder under load; spatial memory and adjacency hold; the lead is always extracted from the same topology chain.
- **Attention without layout shift** — accent swap (amber/red text, bar, border, LED) on unchanged geometry is the right alarm mechanism for a 2s-cadence surface.
- **Telemetry truthfulness as a UI citizen** — `/healthz` polling states "HF live inference · synthetic input" vs. an honest fallback; never claims simulated or live CCTV.
- **Correct quiet treatment** — `DISPATCH_STAFF` dashed-amber + "awaiting operator" stays static.

## Priority issues

**P0 — Proof-of-autonomy is unwired and unco-located.** WS ingests only `ZoneMetric`; interventions reach the log only via initial fetch + manual overrides. The operator cannot answer "is the system acting?" from the surface. Fix: stream intervention events on the WS/SSE and pin the lead zone's latest action inside the lead block ("AUTO → signage reroute · 2s ago"). → `layout`, `animate`, `clarify`

**P0 — FORCE REROUTE fires a physical signage intervention on one click.** No confirm, no undo, no busy feedback. Fix: arm-step ("FORCE REROUTE" → armed "CONFIRM?") then execute; record an operator acknowledgment per zone. → `clarify`

**P1 — No staleness or change signal.** A dead zone looks live until the global LOST flips; no per-zone age, no diff on update. Fix: dim after N missed cadences, quiet tick on the lead numeral when it changes. → `layout`, `animate`

**P1 — Power-user and assistive gaps.** One focusable element on the page; no accelerators; log is div-soup with no list/`aria-live`; lead numeral not tied to `zone_id`; `prefers-reduced-motion` committed in PRODUCT.md but implemented nowhere; `term-dim` hovers at the AA edge at 9–11px. → `typeset`, `colorize`, `clarify`

**P2 — Accent discipline is broken.** Amber is furniture (always-on INTERVENTIONS stat, banner, hover, log type, dispatch borders) while the brand reserves one accent for the zone needing attention; errors render amber instead of red. → `colorize`

## Persona red flags

- **Power user:** mouse-only override, no sort/filter, no acknowledge/silence, no history beyond 50 lines, tab order pointless (one focusable element).
- **Screen reader:** nested divs with no list or live-region; interventions never announced; oversized numeral lacks `aria-labelledby`; LED spans unlabeled.
- **Keyboard:** focus ring present but every affordance is hover-only; no reduced-motion path.
- **Contrast:** `#6e7f88` term-dim ≈4.5–4.9:1 at 9–11px — at the AA threshold; `text-[9px]` timestamps carry state but are decorative-by-size.

## Minor observations

- Two severity color maps (`congestion.ts` vs `InterventionLog.tsx`) — drift risk.
- `pct()` clamps at 100, masking oversubscription.
- Lead numeral is occupancy-fill; lead tie-break is density — two load metrics, no canonical one.
- Two CRITICAL zones → one lead; the second row has no urgency tie-break (no trend/velocity).
- "// awaiting telemetry…" / "// signage-api" leak dev-comment framing onto an operator surface.
- Banner container width vs grid gap — alignment drift; no `aria-live`.
- Raw enums (`SIGNAGE_REROUTE`, `DISPATCH_STAFF`) conflict with the sentence-case brand.

## Questions

1. Autonomy is the product, yet the lead block shows a static load % and a button — where does "negotiating"/"already rerouting" appear at the point of concern?
2. Every zone is its own decision-maker with sub-millisecond peer negotiation, but the surface renders static rows and one action — what would the negotiation itself look like as a single authored 300–500ms beat?
3. The operator has exactly one action and no way to say "I see it, machine — continue" — where does human acknowledgment live, and should it change what the machine does next?

## Key evidence (Assessment B)

- Detector `detect.mjs --json frontend/app frontend/components` → `[]` (exit 0); `--scope layout` → `[]`. Control sample (`animate-bounce`) fired `bounce-easing` warning + exit 2 — clean pass is genuine.
- Structural check: all imports resolve (`SEVERITY_RANK`, `TopBar`/`ZoneLead`/`ZoneRow`/`InterventionLog` defaults, `applyIntervention`/`fetchInterventions`/`fetchZones`/`streamZonesWS`, `Intervention`/`ZoneMetric`); `@/*` alias → `./*`.
- Browser-rendered pass skipped: no browser/playwright automation available.
