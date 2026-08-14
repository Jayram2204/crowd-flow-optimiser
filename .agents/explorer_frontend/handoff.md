# Frontend Test Suite Handoff Report

## 1. Observation

### 1.1 Environment and Dependencies
- **Node.js**: v20.20.2 | **npm**: 11.17.0
- **Frontend Stack** (`/Users/noname/documents/misc/crowd-flow-optimiser/frontend/package.json`):
  - Next.js: `15.1.0` (App Router)
  - React: `19.0.0`
  - React-DOM: `19.0.0`
  - Tailwind CSS: `4.0.0`
  - TypeScript: `5.x`
- **Current `scripts` in `frontend/package.json`**:
  ```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  }
  ```
- **Current Test Infrastructure**:
  - **No test runner or libraries currently installed** (`jest`, `@testing-library/*`, `@types/jest`, `jest-environment-jsdom` are absent).
  - No `jest.config.*` or `jest.setup.*` files exist in `frontend/`.
  - No `test` script in `package.json`.

### 1.2 Complete Frontend Source Code Inventory

| File Path | Role | Key Exported Entities / Logic | DOM / Async Dependencies |
|---|---|---|---|
| `lib/types.ts` | Type definitions | `Congestion`, `ZoneMetric`, `InterventionType`, `Intervention`, `WSFrame` | Pure TypeScript types |
| `lib/api.ts` | API Client & Streamers | `fetchWithTimeout`, `fetchZones`, `fetchInterventions`, `applyIntervention`, `streamZonesWS`, `streamZones` | `fetch`, `AbortController`, `WebSocket`, `EventSource`, `setTimeout`, `setInterval` |
| `components/congestion.ts` | Congestion style & formatting | `INTERVENTION_LABEL`, `SEVERITY_COLOR`, `SEVERITY_RANK`, `CONGESTION_STYLE`, `pct` | Pure calculation & mappings |
| `components/TopBar.tsx` | Header bar & aggregates | `TopBar`, `TelemetrySource`, `Stat` | `fetch` (`/healthz` polling every 30s), aggregate calculations |
| `components/ZoneLead.tsx` | Lead zone card & override | `ZoneLead`, `ageAgo` | 2-step armed button (`setTimeout` 4s auto-disarm), metric bars, intervention label |
| `components/ZoneRow.tsx` | Field row display | `ZoneRow` | Formatted metrics, LED dot, width bar, attention vs nominal classes |
| `components/InterventionLog.tsx` | Action log panel | `InterventionLog`, `MAX_LOG_LINES = 50` | Slice cap at 50, timestamp formatting, `DISPATCH_STAFF` specific styling |
| `components/landing/LandingPage.tsx` | Persuade landing page | `LandingPage` | `IntersectionObserver` (negotiation ping), CSS entrance animation |
| `app/layout.tsx` | Root layout | `RootLayout`, `metadata` | `globals.css` import, dark theme container |
| `app/page.tsx` | Root page | `Page`, `metadata` | Renders `LandingPage` |
| `app/operate/page.tsx` | Operate dashboard (page) | `Operate`, `ZONE_ORDER` | `fetchZones`, `fetchInterventions`, `streamZonesWS`, `applyIntervention`, lead calculation, banner flash |

---

## 2. Logic Chain

### 2.1 Next.js 15 & React 19 Testing Compatibility
1. Next.js 15 utilizes SWC compilation under the hood and provides `next/jest` (`import nextJest from 'next/jest.js'`), which automatically configures:
   - SWC transpilation for TypeScript and React 19 JSX (`jsx: "preserve"` in tsconfig).
   - Mocking of CSS imports (e.g. `globals.css`) and image imports (`next/image`).
   - Loading of environment variables (`.env`, `.env.local`).
   - Resolution of path aliases defined in `tsconfig.json` (`@/*` -> `./*`).
2. React 19 requires `@testing-library/react` version `^16.1.0` or higher to properly support React 19 root rendering and act behavior.
3. Node 20 / jsdom requires `@testing-library/jest-dom` version `^6.6.3` and `jest-environment-jsdom` version `^29.7.0`.

### 2.2 Mocking Strategy Chain
1. **Fetch & Timers**:
   - `lib/api.ts` uses `AbortController` and `setTimeout` inside `fetchWithTimeout`. Jest fake timers (`jest.useFakeTimers()`) combined with `global.fetch = jest.fn()` enable testing fast timeouts, abort signals, and cleanup in `finally` blocks.
   - `TopBar.tsx` (`TelemetrySource`) polls `/healthz` on an interval. Mocks for `fetch` ensure both live and simulated modes can be verified along with interval cleanup on unmount.
2. **WebSocket & SSE**:
   - In jsdom, `WebSocket` and `EventSource` are undefined.
   - A mock `WebSocket` implementation must simulate connection lifecycle (`onopen`, `onmessage`, `onerror`, `onclose`, `send`, `close`), frame envelope decoding (`{event: "metric" | "intervention" | "pong"}`), 15s ping timer / 5s pong timeout, and exponential backoff auto-reconnect (`Math.min(2000 * 2^attempts, 30000)`).
   - A mock `EventSource` must simulate `addEventListener` for SSE event types (`metric`, `snapshot`, `intervention`), data parsing, and `close()`.
3. **Browser Observers**:
   - `LandingPage.tsx` invokes `IntersectionObserver` on mount.
   - `jest.setup.ts` must provide a global mock for `IntersectionObserver` and `ResizeObserver` to prevent test runner crashes during component mounts.

---

## 3. Caveats

1. **React 19 Hooks and Testing Library**:
   - Avoid older `@testing-library/react` v14/v15 versions because they may emit act warnings or throw hydration errors with React 19. Must install `@testing-library/react@^16.1.0`.
2. **ESM / CJS Interop in Next.js 15**:
   - Next.js 15 uses `next/jest.js`. Use `jest.config.ts` or `jest.config.mjs` with `nextJest` to ensure ESM module imports work seamlessly.
3. **Jest Global Types vs TypeScript**:
   - When running `npm run typecheck` (`tsc --noEmit`), TypeScript needs to resolve Jest types without polluting standard application builds. Installing `@types/jest` and ensuring `tsconfig.json` includes tests in typechecking prevents type mismatches.

---

## 4. Conclusion & Actionable Implementation Plan

### 4.1 Packages to Install in `frontend/package.json`
Run inside `frontend/`:
```bash
npm install --save-dev jest @types/jest jest-environment-jsdom @testing-library/react @testing-library/dom @testing-library/jest-dom @testing-library/user-event ts-node
```

### 4.2 Required Configuration Files

#### 1. `frontend/jest.config.ts`
```ts
import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testMatch: [
    '**/__tests__/**/*.[jt]s?(x)',
    '**/?(*.)+(spec|test).[jt]s?(x)',
  ],
  collectCoverageFrom: [
    'app/**/*.{ts,tsx}',
    'components/**/*.{ts,tsx}',
    'lib/**/*.{ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
  ],
};

export default createJestConfig(config);
```

#### 2. `frontend/jest.setup.ts`
```ts
import '@testing-library/jest-dom';

// Polyfill IntersectionObserver
class MockIntersectionObserver implements IntersectionObserver {
  readonly root: Element | Document | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];
  callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe = jest.fn((target: Element) => {
    this.callback(
      [{ isIntersecting: true, target } as IntersectionObserverEntry],
      this
    );
  });
  unobserve = jest.fn();
  disconnect = jest.fn();
  takeRecords = jest.fn(() => []);
}
global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

// Polyfill ResizeObserver
class MockResizeObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
```

#### 3. Update `frontend/package.json` Scripts
```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "typecheck": "tsc --noEmit",
  "test": "jest",
  "test:watch": "jest --watch",
  "test:coverage": "jest --coverage"
}
```

---

### 4.3 Test Suite Inventory & Target Test Cases

| Test Suite File | Tested Unit | Specific Test Scenarios |
|---|---|---|
| `__tests__/lib/api.test.ts` | `lib/api.ts` | 1. `fetchWithTimeout`: successful fetch, timeout abort rejection, timer clearance in finally block.<br>2. `fetchZones`: GET `/api/v1/zones`, returns array, throws on HTTP error.<br>3. `fetchInterventions`: GET `/api/v1/interventions`, returns array, throws on HTTP error.<br>4. `applyIntervention`: POST `/api/v1/interventions` with json payload, returns created intervention.<br>5. `streamZonesWS`: connects to `/api/v1/ws`, handles `onOpen`, sends ping on 15s interval, clears pong timeout on pong frame, dispatches `metric` & `intervention` frames, ignores malformed JSON, calls `onError`, performs auto-reconnect with exponential backoff on close, cleanup function terminates socket and prevents reconnect.<br>6. `streamZones` (SSE): connects to EventSource, binds event listeners, parses incoming messages, calls close on cleanup. |
| `__tests__/components/congestion.test.ts` | `components/congestion.ts` | 1. `pct`: computes correct rounded percentage, handles `capacity <= 0` gracefully (returns 0), clamps overcapacity to 100%.<br>2. `CONGESTION_STYLE`: verifies styling and attention flag (`false` for LOW/MODERATE, `true` for HIGH/CRITICAL).<br>3. `INTERVENTION_LABEL`: verifies human-readable labels.<br>4. `SEVERITY_RANK` & `SEVERITY_COLOR`: validates ranking hierarchy (LOW: 0 to CRITICAL: 3) and color mappings. |
| `__tests__/components/TopBar.test.tsx` | `components/TopBar.tsx` | 1. Header lockup and branding rendering.<br>2. Stream connection status: `STREAM::LIVE` + green LED vs `STREAM::LOST` + red LED.<br>3. Aggregate statistics: total zone count, occupancy/capacity sum, HIGH and CRITICAL count badges with appropriate conditional accent styling, intervention count.<br>4. `TelemetrySource`: fetches `/healthz` on mount, displays live HF inference label when `mode === "live"`, displays simulated fallback when not live or on error, cleans up polling timer on unmount. |
| `__tests__/components/ZoneLead.test.tsx` | `components/ZoneLead.tsx` | 1. Renders lead zone ID, percentage occupancy, congestion badge, density, and inflow/outflow rates.<br>2. Renders load bar with width corresponding to occupancy percent.<br>3. Displays pinned `autoAction` label, relative time (`ageAgo`), and `"AUTO"` vs `"OP OVERRIDE"` badge.<br>4. Two-step manual override arming: button transitions from `▸ FORCE REROUTE` to `▸ CONFIRM REROUTE?` on 1st click; executes `onOverride` on 2nd click; auto-disarms after 4000ms timeout; resets on `zone_id` prop change; disabled when `busy={true}`. |
| `__tests__/components/ZoneRow.test.tsx` | `components/ZoneRow.tsx` | 1. Renders zone row with ID, occupancy/capacity, fill bar, percentage, congestion status, and inflow/outflow.<br>2. Renders nominal styling for LOW/MODERATE and attention styling for HIGH/CRITICAL. |
| `__tests__/components/InterventionLog.test.tsx` | `components/InterventionLog.tsx` | 1. Displays empty state "awaiting physical actions…" when log is empty.<br>2. Displays list of interventions with zone ID, severity badge, type label, target zone, message, and local time.<br>3. Applies distinct dashed style and "→ awaiting operator" tag for `DISPATCH_STAFF` interventions.<br>4. Applies `log-land` CSS class to the newest intervention (index 0).<br>5. Truncates log at 50 items and renders "+N older" counter when list exceeds 50. |
| `__tests__/components/LandingPage.test.tsx` | `components/landing/LandingPage.tsx` | 1. Renders landing hero ("WE EXECUTE, WE DON'T JUST WATCH."), thesis, and navigation links.<br>2. Renders "HOW IT WORKS" items 01-04 and SVG peer-negotiation diagram.<br>3. Attaches `IntersectionObserver` to trigger negotiation ping animation upon scroll into view.<br>4. Renders "STATUS — WHAT'S REAL TODAY" honesty card and footer. |
| `__tests__/app/OperatePage.test.tsx` | `app/operate/page.tsx` | 1. Loads initial data via `fetchZones` and `fetchInterventions` on mount.<br>2. Subscribes to `streamZonesWS`, marks connected on first metric frame, appends new interventions.<br>3. Lead zone selection logic: picks highest severity zone; tiebreaks on higher density; places remaining zones into `ZoneRow` list.<br>4. Manual override flow: handles `onOverride`, invokes `applyIntervention`, updates local interventions list, flashes success status banner for 4s; handles error with error banner.<br>5. Unsubscribes from WebSocket stream on unmount. |
| `__tests__/app/PageRoutes.test.tsx` | `app/page.tsx`, `app/layout.tsx` | 1. Root page renders `LandingPage` and exports page metadata.<br>2. Root layout wraps children in html/body with `dark` and `scanlines` classes. |

---

## 5. Verification Method

To verify the completed implementation independently:

1. **Install Dependencies**:
   ```bash
   cd /Users/noname/documents/misc/crowd-flow-optimiser/frontend && npm install
   ```
2. **Execute Full Test Suite**:
   ```bash
   cd /Users/noname/documents/misc/crowd-flow-optimiser/frontend && npm run test
   ```
   *Expected outcome*: All test suites pass (100% pass rate, 0 failures).
3. **Execute Test Suite with Coverage**:
   ```bash
   cd /Users/noname/documents/misc/crowd-flow-optimiser/frontend && npm run test:coverage
   ```
   *Expected outcome*: High coverage across `lib/api.ts`, `components/*.tsx`, and `app/**/*.tsx`.
4. **Execute TypeScript Typecheck**:
   ```bash
   cd /Users/noname/documents/misc/crowd-flow-optimiser/frontend && npm run typecheck
   ```
   *Expected outcome*: Exits with code 0 (no TypeScript compilation errors).
5. **Verify Next.js Build**:
   ```bash
   cd /Users/noname/documents/misc/crowd-flow-optimiser/frontend && npm run build
   ```
   *Expected outcome*: Next.js build succeeds without bundle or configuration issues.
