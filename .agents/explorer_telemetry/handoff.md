# Handoff Report: AI Telemetry Test Suite Exploration

## 1. Observation

### 1.1 Environment and Runtime
- **Python Version**: Python 3.9.6 in local virtual environment (`/Users/noname/documents/misc/crowd-flow-optimiser/ai-telemetry/.venv`), Python 3.11 in `Dockerfile`.
- **Package Manager Note**: `.venv/bin/pip` contains a stale shebang referencing `/Users/noname/Documents/crowd-flow-optimiser/ai-telemetry/.venv/bin/python3`. Direct invocation `./.venv/bin/pip` fails with code 127 (`bad interpreter`), but executing via `./.venv/bin/python -m pip` works flawlessly.
- **Dependencies (`requirements.txt`)**:
  - `fastapi==0.111.0`, `uvicorn[standard]==0.30.1`, `httpx==0.27.0`
  - `python-multipart==0.0.9`, `pydantic==2.7.4`
  - `huggingface-hub==0.23.4`, `transformers==4.44.2`, `torch==2.5.1`, `timm==1.0.9`, `pillow==10.4.0`, `ultralytics==8.4.118`
- **Installed Test Packages**: `pytest==8.4.2`, `anyio==4.12.1`, `pluggy==1.6.0`.
- **Missing Test Dependencies**: `pytest-cov` and `coverage` (and `pytest-asyncio`) are **not** installed in `.venv`. Dry-run verification confirmed `python -m pip install pytest-cov pytest-asyncio` installs without conflicts.
- **Test Configuration**: No `pytest.ini`, `pyproject.toml`, or `.coveragerc` exists in `ai-telemetry/`.

### 1.2 Asset Inventory
- **Model Weights (`data/weights/`)**: `data/weights/yolo11n.pt` (5.6 MB local YOLOv11 nano weights). Verified functional locally on MPS/CPU.
- **Sample Frames (`data/frames/`)**: 5 JPEG files (`bandra.jpg`, `dali.jpg`, `embarcadero.jpg`, `fulong.jpg`, `tamsui.jpg`).

### 1.3 Codebase Architecture and Module Inventory

| Module | Location | Lines | Core Responsibilities | Current Test Status |
|---|---|---|---|---|
| `app.core.config` | `app/core/config.py` | 51 | Settings dataclass, env overrides, default 9-zone topology mapping `zone_id -> (capacity, viewport_area_m2)` | Tested in `test_config.py` (4 tests) |
| `app.models` | `app/models.py` | 35 | Pydantic models: `DensityEstimateRequest`, `DensityEstimateResponse`, `ZoneMetric`, `TelemetryBatch` | Partial in `test_models.py` (3 tests) |
| `app.services.density` | `app/services/density.py` | 240 | `DensityEstimator` (simulated vs live YOLO/transformers inference, person score filtering, frame caching, classification) & `VenueScenario` (crowd dynamics, surge waves, exponential relaxation) | Partial in `test_density.py` (11 tests). **`VenueScenario` has 0 tests.** |
| `app.services.simulator` | `app/services/simulator.py` | 60 | `run_forever` async telemetry loop & `_build_batch` batch generator fusing `VenueScenario` with `DensityEstimator` and emitting to backend `POST /api/v1/telemetry` | **0 tests (100% UNTESTED)** |
| `app.main` | `app/main.py` | 108 | FastAPI app, lifespan background task manager, endpoints: `GET /healthz`, `GET /v1/models`, `POST /v1/density/estimate`, `POST /api/v1/analyze-density` | Partial in `test_api.py` (5 tests). **1 test failing**. |

### 1.4 Test Suite Status & Baseline Failure
Running `./.venv/bin/python -m pytest` yielded 23 collected items: **22 passed, 1 failed**:
```
FAILED tests/test_api.py::test_density_estimate_unknown_zone - assert 400 == 500
```
- **Root Cause**: `app/main.py:62-63` performs validation:
  ```python
  if req.zone_id not in settings.zones:
      raise HTTPException(status_code=400, detail="Unknown zone_id")
  ```
  `tests/test_api.py:48` asserts `r.status_code == 500` with comment `# Unknown zones currently surface as a server error (hardening is backlogged)`. The code was hardened to return 400 Bad Request, but the test assertion was not updated.

### 1.5 Go Backend Ingestion Contract
- Backend endpoint: `POST /api/v1/telemetry` (`backend/internal/api/handlers.go:31-55`).
- Expected payload schema (`backend/internal/models/models.go:17-35`):
  - `zones`: Array of `ZoneMetric` objects (`zone_id`, `capacity`, `density`, `occupancy`, `congestion`, `inflow_rate`, `outflow_rate`, `timestamp`).
  - Backend response on success: `202 Accepted` (`{"accepted": N, "status": "ingested"}`).

---

## 2. Logic Chain

1. **Test Failure Resolution**: `test_density_estimate_unknown_zone` must assert `r.status_code == 400` to reflect the implemented input validation in `app/main.py`.
2. **Coverage Enablement**:
   - Install `pytest-cov` and `pytest-asyncio` into the virtual environment using `./.venv/bin/python -m pip install pytest-cov pytest-asyncio`.
   - Create `pytest.ini` with `addopts = --cov=app --cov-report=term-missing` and `asyncio_mode = auto` so running `pytest` in `ai-telemetry/` immediately executes all tests with coverage reporting.
3. **Simulation Loop Integration Testing (`app/services/simulator.py`)**:
   - `_build_batch(estimator, scenario, frame_ref)` must be tested for:
     - Output schema validity (`TelemetryBatch` containing all 9 configured zones).
     - Metric integrity: zone capacity matching config, density = `occupancy / area`, congestion level matching `estimator.classify()`, valid ISO-8601 UTC timestamp format.
     - Simulated mode vs live mode estimator integration.
   - `run_forever(estimator)` must be tested for:
     - Dispatches POST requests to `settings.emit_to_backend` containing valid batch data.
     - Frame counter increments monotonically (`cctv:1`, `cctv:2`, `cctv:3`).
     - Backend response handling: succeeds on `200` and `202`.
     - Backend rejection handling: handles `400` or `500` rejection with warning log without terminating loop.
     - Network resilience: handles `httpx.ConnectError`, `httpx.TimeoutException`, and generic `httpx.HTTPError` with warning log and retries on next tick.
     - Task cancellation: cleanly terminates on `asyncio.CancelledError` without leaks.
     - Fast execution in test harness: monkeypatch `time.sleep` and set `settings.sim_loop_seconds = 0.001` so full integration tests run in milliseconds.
4. **VenueScenario Dynamic Model Testing (`app/services/density.py`)**:
   - Initial occupancy distribution: all 9 zones initialized within `0.25..0.45 * capacity`.
   - Tick mechanics: phase increments by 0.25 each tick; wave modulation (`0.5 + 0.45 * abs(sin(phase))`).
   - Surge dynamics: when `4 < phase % 10 < 6`, gate cluster zones (`GATE_A`, `GATE_B`, `E_PIER`, `BAG_CHECK`) experience a 1.9x target boost capped at `1.28 * capacity`; non-gate zones target `0.85 * capacity`.
   - Exponential relaxation: `current += (target - current) * 0.35`.
   - Inflow/outflow calculations: `inflow = max(0, target - current) * 6`, `outflow = max(0, current - target) * 6`.
5. **Live-Mode Pipeline Integration Testing**:
   - Real detector inference using bundled `data/weights/yolo11n.pt` and sample frames `data/frames/`.
   - Multi-tick frame cycling (`_frame_for` rotation via `_frame_seq`).
   - Person count score filtering (`PERSON_MIN_SCORE = 0.5`) and non-person class exclusion.
   - Frame cache verification (`FRAME_CACHE_TTL = 8.0s`).
   - Fallback cascading: YOLO failure -> Transformers pipeline -> Simulated mode degradation.
   - Multipart frame upload endpoint (`POST /api/v1/analyze-density`):
     - Valid JPEG/PNG upload returns 200 with `gate_id`, `status: "success"`, `model_used`, `estimated_density`, `timestamp`.
     - Invalid MIME type (e.g. `text/plain`, `application/pdf`) returns 400 Bad Request.
     - Unknown `gate_id` returns 400 Bad Request.
     - Inference exception returns 500 Internal Server Error.
6. **FastAPI Lifespan and Service Integration**:
   - Lifespan initialization: creates `run_forever` task when `settings.emit_to_backend` is non-empty; cancels task cleanly on shutdown.
   - Lifespan with `settings.emit_to_backend = ""` (emitter disabled).
   - `/healthz` and `/v1/models` responses under `simulated` and `live` modes.

---

## 3. Caveats

1. **Virtual Environment Pip Execution**: Do not run `.venv/bin/pip` directly due to the hardcoded interpreter path; use `.venv/bin/python -m pip`.
2. **Mocking External Network Calls in Live Tests**: When testing Hugging Face fallback paths, ensure `transformers.pipeline` or `huggingface_hub` is mocked so test runs do not fail in offline environments or incur external API latency.
3. **Async Test Execution**: `run_forever` contains `while True:`. When testing it asynchronously, use `asyncio.create_task` with a mock transport or `unittest.mock.patch("httpx.AsyncClient.post")`, sleep briefly for a controlled number of ticks, and cancel the task with `task.cancel()` followed by `await task` inside `try...except asyncio.CancelledError`.
4. **Fast Test Execution**: `_simulated_estimate` has a `time.sleep(random.uniform(0.05, 0.15))` call to mimic inference delay. Integration test fixtures should patch `time.sleep` to `lambda _: None` to ensure all tests complete in under 5 seconds.
5. **Global Frame Counter**: `simulator._frames` is a module-level global integer. Tests asserting exact `cctv:N` values should reset `simulator._frames = 0` in fixtures or test setup if exact numbering is checked.

---

## 4. Conclusion & Detailed Implementation Plan

### 4.1 Recommended Implementation Steps for the Implementer

#### Step 1: Install Test Dependencies & Configure Pytest
1. Run `./.venv/bin/python -m pip install pytest-cov pytest-asyncio`
2. Create `ai-telemetry/pytest.ini`:
   ```ini
   [pytest]
   testpaths = tests
   python_files = test_*.py
   python_classes = Test*
   python_functions = test_*
   addopts = --cov=app --cov-report=term-missing --cov-report=html:coverage_html
   asyncio_mode = auto
   ```
3. Update `ai-telemetry/requirements.txt` to include test dependencies:
   ```txt
   pytest==8.4.2
   pytest-cov>=6.0.0
   pytest-asyncio>=0.23.0
   ```

#### Step 2: Fix Baseline Regression in `tests/test_api.py`
In `tests/test_api.py`, update `test_density_estimate_unknown_zone` (line 48):
```python
def test_density_estimate_unknown_zone():
    with TestClient(app, raise_server_exceptions=False) as c:
        r = c.post("/v1/density/estimate", json={"frame_ref": "cctv:1", "zone_id": "NOPE"})
        assert r.status_code == 400
        assert "Unknown zone_id" in r.json()["detail"]
```
Add missing API test cases in `tests/test_api.py`:
- `test_analyze_density_invalid_content_type`: Upload file with `text/plain` -> expect 400.
- `test_analyze_density_unknown_gate`: Upload file with `gate_id="UNKNOWN"` -> expect 400.
- `test_density_estimate_inference_failure`: Mock `estimator.estimate` to raise Exception -> expect 500.
- `test_analyze_density_inference_failure`: Mock `estimator.estimate` to raise Exception -> expect 500.
- `test_lifespan_task_management`: Test lifespan startup and shutdown with background emitter task enabled.

#### Step 3: Implement Simulator Integration Tests (`tests/test_simulator.py`)
Create `tests/test_simulator.py` covering:
1. `test_build_batch_simulated_mode`: Verify 9 zones generated, valid schema, capacity mapping, density = occupancy / area, congestion classification, UTC ISO timestamp.
2. `test_build_batch_live_mode`: Verify `_build_batch` operates with live `DensityEstimator`.
3. `test_run_forever_successful_emissions`: Run `run_forever` for 3 ticks with mocked `httpx.AsyncClient.post` returning 202 Accepted. Verify payloads match `TelemetryBatch` schema and frame refs increment `cctv:1`, `cctv:2`, `cctv:3`.
4. `test_run_forever_backend_rejected_status`: Test response status 400 / 500 from backend; verify loop logs warning and continues.
5. `test_run_forever_backend_http_error`: Test `httpx.ConnectError` and `httpx.TimeoutException`; verify loop catches error, logs warning, and retries.
6. `test_run_forever_clean_cancellation`: Start task, cancel task, verify `asyncio.CancelledError` handled cleanly.

#### Step 4: Implement VenueScenario Dynamic Model Tests (`tests/test_venue_scenario.py` or in `tests/test_density.py`)
Add unit tests for `VenueScenario`:
1. `test_venue_scenario_initialization`: 9 zones initialized with `0.25 * cap <= occ <= 0.45 * cap`.
2. `test_venue_scenario_tick_advances_phase`: Each tick increments `phase` by 0.25.
3. `test_venue_scenario_surge_activation`: Advance phase to surge window (`4 < phase % 10 < 6`), verify gate cluster (`GATE_A`, `GATE_B`, `E_PIER`, `BAG_CHECK`) reaches higher target occupancy while platforms remain below capacity.
4. `test_venue_scenario_inflow_outflow_rates`: Verify non-negative inflow and outflow rates derived from target relaxation.
5. `test_venue_scenario_occupancy_non_negative`: Verify occupancy never drops below 0.

#### Step 5: Implement Live-Mode Execution Pipeline Integration Tests (`tests/test_live_pipeline.py`)
Create `tests/test_live_pipeline.py` covering:
1. `test_live_pipeline_local_weights_inference`: End-to-end inference with real `yolo11n.pt` and `data/frames/bandra.jpg` returning valid person count and density.
2. `test_live_pipeline_multi_zone_tick_rotation`: Test cycling through frames for all 9 zones.
3. `test_live_pipeline_frame_caching`: Test second estimate on same frame hits cache within 8.0s TTL.
4. `test_live_pipeline_fallback_to_transformers`: When YOLO fails, loads transformers pipeline.
5. `test_live_pipeline_fallback_to_simulated`: When both YOLO and transformers fail, degrades to simulated mode.
6. `test_live_pipeline_batch_emission`: End-to-end `_build_batch` with live detector emitting valid `TelemetryBatch`.

---

## 5. Verification Method

To independently verify the test suite and coverage:

1. **Run full pytest suite**:
   ```bash
   cd /Users/noname/documents/misc/crowd-flow-optimiser/ai-telemetry
   ./.venv/bin/python -m pytest
   ```
   **Pass Condition**: 100% of tests pass (0 failures, 0 errors).

2. **Verify coverage reporting**:
   ```bash
   cd /Users/noname/documents/misc/crowd-flow-optimiser/ai-telemetry
   ./.venv/bin/python -m pytest --cov=app --cov-report=term-missing
   ```
   **Pass Condition**:
   - Coverage table displays lines, misses, and coverage percentage for:
     - `app/core/config.py` (>90%)
     - `app/models.py` (>95%)
     - `app/main.py` (>90%)
     - `app/services/density.py` (>90%)
     - `app/services/simulator.py` (>95%)
   - Overall test suite coverage across `app/` exceeds 90%.

3. **Verify FastAPI endpoints with TestClient**:
   - `GET /healthz` -> 200
   - `GET /v1/models` -> 200
   - `POST /v1/density/estimate` (valid & invalid) -> 200 / 400
   - `POST /api/v1/analyze-density` (valid & invalid) -> 200 / 400

4. **Verify backend contract compatibility**:
   - Run Go backend tests to confirm telemetry contract alignment:
     ```bash
     cd /Users/noname/documents/misc/crowd-flow-optimiser/backend
     go test ./...
     ```
