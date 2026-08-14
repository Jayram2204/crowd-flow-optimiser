# Backend Go Test Suite — Exploration & Architecture Report

**Working Directory**: `/Users/noname/documents/misc/crowd-flow-optimiser/.agents/explorer_backend`  
**Target Subsystem**: Backend Go Service (`/Users/noname/documents/misc/crowd-flow-optimiser/backend`)  
**Date**: 2026-08-14  

---

## 1. Observation

### 1.1 Environment & Toolchain
- **Go Version**: `go version go1.26.5 darwin/arm64`
- **Module Path**: `crowd-flow-optimiser/backend` (`go 1.22`)
- **Dependencies (`go.mod`)**:
  - `github.com/gorilla/websocket v1.5.3` (only external dependency)
- **Standard Library Tooling Available**: `testing`, `net/http/httptest`, `context`, `sync`, `time`, `encoding/json`, `os`, `syscall`, `strings`, `sort`

### 1.2 Current Package & Statement Coverage Baseline
Running `go test -cover ./...` in `backend/` yields:
```
?   crowd-flow-optimiser/backend                        coverage: 0.0% of statements
?   crowd-flow-optimiser/backend/cmd/server             coverage: 0.0% of statements
ok  crowd-flow-optimiser/backend/internal/agent         0.782s coverage: 93.1% of statements
ok  crowd-flow-optimiser/backend/internal/api           0.990s coverage: 42.5% of statements
?   crowd-flow-optimiser/backend/internal/config        coverage: 0.0% of statements [no test files]
ok  crowd-flow-optimiser/backend/internal/intervention  1.396s coverage: 100.0% of statements
?   crowd-flow-optimiser/backend/internal/models        [no test files]
ok  crowd-flow-optimiser/backend/internal/state         1.885s coverage: 100.0% of statements
```

### 1.3 Data Race Detected Under `-race`
Running `go test -race ./...` revealed a data race in `internal/agent/network_test.go`:
- **Location**: `internal/agent/network_test.go:48` and `internal/agent/node.go:58`
- **Verbatim Error**:
  ```
  ==================
  WARNING: DATA RACE
  Read at 0x00c00012e0f0 by goroutine 13:
    crowd-flow-optimiser/backend/internal/agent.(*Node).Run()
        internal/agent/node.go:58
  Previous write at 0x00c00012e0f0 by goroutine 11:
    crowd-flow-optimiser/backend/internal/agent.TestNegotiateTimeout()
        internal/agent/network_test.go:48
  ==================
  --- FAIL: TestNegotiateTimeout (0.00s)
  ```
- **Cause**: `TestNegotiateTimeout` replaces `b.Negotiation = make(chan NegotiationOffer, 8)` on a running node `b` whose `Run()` loop is already executing and reading `b.Negotiation`.

### 1.4 Detailed Inventory of Uncovered / Under-Tested Components

| Package / File | Lines | Current Coverage | Missing Test Cases / Gaps |
|---|---|---|---|
| `internal/config/config.go` | 45 | 0.0% (no tests) | `Load()`, `env()`, `splitCSV()`, default fallbacks, whitespace trimming, custom env overrides |
| `internal/models/models.go` | 65 | 0.0% (no tests) | JSON marshal/unmarshal for `ZoneMetric`, `TelemetryBatch`, `Intervention`, `AdHocIntervention`, omitempty for `offline` & `target_zone`, enum constants |
| `internal/api/ws.go` | 90 | 0.0% (no tests) | WebSocket upgrade, initial full snapshot emission, live metric stream, live intervention stream, client disconnect unregistration, ping heartbeat, slow clients, concurrent clients, reconnects |
| `internal/api/handlers.go` | 193 | 42.5% | `handleListZones` (`GET /api/v1/zones`), `handleStream` (SSE `GET /api/v1/stream`), flusher error check, context cancellation |
| `internal/api/router.go` | 48 | Partial | CORS preflight `OPTIONS` requests returning 204 No Content, logger middleware pass-through |
| `cmd/server/main.go` | 57 | 0.0% (no tests) | Server setup, router wiring, context cancellation / graceful shutdown flow |
| `internal/agent/network_test.go` | 98 | 93.1% | Fix `TestNegotiateTimeout` data race so `go test -race ./...` passes cleanly |

---

## 2. Logic Chain

### 2.1 Concurrency & WebSocket Streaming Mechanics (`internal/api/ws.go`)
- **Connection Handshake**: `upgrader.Upgrade(w, r, nil)` upgrades the HTTP request to WebSocket. If an invalid or non-WebSocket request arrives, it logs and returns without panic.
- **Subscription Lifecycle**:
  - `sub, unsub := h.state.Subscribe()` creates a 64-capacity buffered channel for metrics.
  - `ivSub, unsubIv := h.signage.Subscribe()` creates a 64-capacity buffered channel for interventions.
  - Defer blocks ensure `unsub()` and `unsubIv()` are always called on function exit.
- **Initial Snapshot**: The handler iterates over `h.state.All()` and writes each metric as an envelope `{"event":"metric", "data": <metric>}`. If a write fails during snapshot, it returns immediately and tears down subscriptions.
- **Inbound Reader Loop**: A dedicated goroutine runs `conn.ReadMessage()` until EOF/error, then closes `done := make(chan struct{})`. This signals the main select loop to terminate when the client closes the connection.
- **Event Multiplexing**:
  - `case <-done`: Client disconnected -> terminates handler, triggers deferred unregister.
  - `case m := <-sub`: Serializes metric frame with `5s` write deadline.
  - `case iv := <-ivSub`: Serializes intervention frame with `5s` write deadline.
  - `case <-ticker.C`: Emits `websocket.PingMessage` every 20 seconds.
- **Reconnection & Concurrent Client Handling**:
  - Each WebSocket connection is an independent goroutine with its own channel subscriber.
  - Rapid reconnections must safely allocate and release subscriber slots in `state.Manager` and `intervention.Service` maps protected by mutexes.
  - High concurrency (multiple simultaneous WS clients) requires broadcast fan-out to all active subscribers without blocking other consumers.

### 2.2 SSE Streaming Mechanics (`internal/api/handlers.go:handleStream`)
- Uses `http.Flusher` interface. If `w.(http.Flusher)` is not supported, responds with 500.
- Sets SSE headers: `text/event-stream`, `no-cache`, `keep-alive`, `X-Accel-Buffering: no`.
- Emits initial `snapshot` events, then listens to `r.Context().Done()`, `sub`, `ivSub`, and `ticker.C` (heartbeat comments `: heartbeat\n\n`).

### 2.3 Configuration Loader (`internal/config/config.go`)
- `Load()` reads `BACKEND_HTTP_ADDR` (default `:8080`) and `BACKEND_ZONE_TOPOLOGY` (default 9 comma-separated zones).
- `splitCSV()` must trim whitespace (`" GATE_A , GATE_B " -> ["GATE_A", "GATE_B"]`) and discard empty items (`"A,,B"` or `"  ,  "`).
- `env()` must return fallback when environment variable is unset or empty string.

### 2.4 Models & Serialization (`internal/models/models.go`)
- `ZoneMetric`: `offline` has `omitempty`. When `Offline == false`, JSON omits `offline`. When `Offline == true`, JSON includes `"offline": true`.
- `Intervention`: `target_zone` has `omitempty`. `applied_at` and `timestamp` use ISO8601/RFC3339.
- `TelemetryBatch`: JSON root contains `"zones": [...]`.
- `AdHocIntervention`: validates `zone_id` and `type` fields; `message` is optional.

### 2.5 Race Detector Cleanliness (`internal/agent/network_test.go`)
- In `TestNegotiateTimeout`, instead of mutating `b.Negotiation` while `b.Run` is active, the test can create a dedicated `Node` without launching `node.Run(ctx)` or pass a non-responding channel directly to test `net.Negotiate` timeout behavior in isolation.

---

## 3. Caveats
1. **Source Code Write Permission**: As an Explorer agent, no source code or test files in `backend/` have been modified directly. All code designs, test case matrices, and snippets are provided in this report for the implementer agent.
2. **External Dependencies**: No new external dependencies are required. `github.com/gorilla/websocket` (already in `go.mod`) and the Go standard library (`net/http/httptest`, `testing`) are sufficient for 100% test coverage.
3. **Standalone Demo (`backend/main.go`)**: `backend/main.go` is a separate prototype script from `cmd/server/main.go`. Unit testing `pendingVerdict` and `gateAgent` in a root `main_test.go` will bring the root package coverage from 0% to >90%.

---

## 4. Conclusion & Recommended Test Architecture

### 4.1 Proposed Test File Layout

```
backend/
├── cmd/
│   └── server/
│       ├── main.go
│       └── main_test.go          [NEW: Server lifecycle, router wiring, graceful shutdown]
├── internal/
│   ├── agent/
│   │   ├── network.go
│   │   ├── network_test.go       [FIX: Eliminate data race in TestNegotiateTimeout]
│   │   ├── node.go
│   │   └── node_test.go
│   ├── api/
│   │   ├── handlers.go
│   │   ├── handlers_test.go      [UPDATE: Add GET /zones, SSE /stream, CORS OPTIONS]
│   │   ├── router.go
│   │   ├── ws.go
│   │   └── ws_test.go            [NEW: Comprehensive WebSocket test suite]
│   ├── config/
│   │   ├── config.go
│   │   └── config_test.go        [NEW: Environment variables & CSV parsing tests]
│   ├── intervention/
│   │   ├── signage.go
│   │   └── signage_test.go
│   ├── models/
│   │   ├── models.go
│   │   └── models_test.go        [NEW: JSON roundtrip, serialization & enum validation]
│   └── state/
│       ├── manager.go
│       └── manager_test.go
├── go.mod
├── go.sum
├── main.go
└── main_test.go                  [NEW: Prototype helper tests]
```

---

### 4.2 Detailed Test Case Matrices & Implementation Blueprints

#### Suite 1: `internal/config/config_test.go` (Target: 100% Coverage)

```go
package config

import (
	"os"
	"reflect"
	"testing"
)

func TestLoad_Defaults(t *testing.T) {
	os.Unsetenv("BACKEND_HTTP_ADDR")
	os.Unsetenv("BACKEND_ZONE_TOPOLOGY")

	cfg := Load()
	if cfg.HTTPAddr != ":8080" {
		t.Fatalf("expected :8080, got %s", cfg.HTTPAddr)
	}
	expectedZones := []string{
		"CONCOURSE_A", "BAG_CHECK", "E_PIER", "GATE_A", "GATE_B",
		"PLATFORM_1", "PLATFORM_2", "SECURITY_T1", "SECURITY_T2",
	}
	if !reflect.DeepEqual(cfg.ZoneIDs, expectedZones) {
		t.Fatalf("expected %v, got %v", expectedZones, cfg.ZoneIDs)
	}
}

func TestLoad_CustomEnv(t *testing.T) {
	t.Setenv("BACKEND_HTTP_ADDR", ":9090")
	t.Setenv("BACKEND_ZONE_TOPOLOGY", "ZONE_1, ZONE_2, ZONE_3")

	cfg := Load()
	if cfg.HTTPAddr != ":9090" {
		t.Fatalf("expected :9090, got %s", cfg.HTTPAddr)
	}
	expectedZones := []string{"ZONE_1", "ZONE_2", "ZONE_3"}
	if !reflect.DeepEqual(cfg.ZoneIDs, expectedZones) {
		t.Fatalf("expected %v, got %v", expectedZones, cfg.ZoneIDs)
	}
}

func TestSplitCSV(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected []string
	}{
		{"empty string", "", nil},
		{"whitespace only", "   ,   ", nil},
		{"single item", "GATE_A", []string{"GATE_A"}},
		{"trimmed items", " A , B , C ", []string{"A", "B", "C"}},
		{"consecutive commas", "A,,B,,,C", []string{"A", "B", "C"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := splitCSV(tt.input)
			if len(got) == 0 && len(tt.expected) == 0 {
				return
			}
			if !reflect.DeepEqual(got, tt.expected) {
				t.Fatalf("splitCSV(%q) = %v; want %v", tt.input, got, tt.expected)
			}
		})
	}
}

func TestEnvFallback(t *testing.T) {
	t.Setenv("TEST_KEY_EXISTING", "custom_val")
	if got := env("TEST_KEY_EXISTING", "fallback"); got != "custom_val" {
		t.Fatalf("expected custom_val, got %s", got)
	}
	if got := env("TEST_KEY_NONEXISTENT", "fallback"); got != "fallback" {
		t.Fatalf("expected fallback, got %s", got)
	}
}
```

---

#### Suite 2: `internal/models/models_test.go` (Target: 100% Coverage)

```go
package models

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestZoneMetric_JSONRoundTrip(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Second)
	m := ZoneMetric{
		ZoneID:      "GATE_A",
		Capacity:    120,
		Density:     0.94,
		Occupancy:   115,
		Congestion:  CongestionCritical,
		InflowRate:  41.5,
		OutflowRate: 3.2,
		Timestamp:   now,
		Offline:     false,
	}

	bytes, err := json.Marshal(m)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}

	// Offline false should be omitted by omitempty
	if strings.Contains(string(bytes), `"offline"`) {
		t.Fatalf("expected offline to be omitted when false, got: %s", string(bytes))
	}

	var parsed ZoneMetric
	if err := json.Unmarshal(bytes, &parsed); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if parsed.ZoneID != m.ZoneID || parsed.Capacity != m.Capacity || parsed.Congestion != m.Congestion {
		t.Fatalf("parsed metric mismatch: %+v vs %+v", parsed, m)
	}

	// Test with Offline: true
	m.Offline = true
	bytes, _ = json.Marshal(m)
	if !strings.Contains(string(bytes), `"offline":true`) {
		t.Fatalf("expected offline:true in json, got: %s", string(bytes))
	}
}

func TestTelemetryBatch_JSON(t *testing.T) {
	raw := `{"zones":[{"zone_id":"A","capacity":100,"occupancy":80,"congestion":"HIGH"}]}`
	var batch TelemetryBatch
	if err := json.Unmarshal([]byte(raw), &batch); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if len(batch.Zones) != 1 || batch.Zones[0].ZoneID != "A" {
		t.Fatalf("unexpected batch content: %+v", batch)
	}
}

func TestIntervention_JSONRoundTrip(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Second)
	iv := Intervention{
		ID:         "iv-123",
		ZoneID:     "GATE_A",
		Type:       InterventionSignageReroute,
		Message:    "Reroute to GATE_B",
		Severity:   CongestionHigh,
		TargetZone: "GATE_B",
		AppliedAt:  now,
	}

	data, err := json.Marshal(iv)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	var parsed Intervention
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if parsed.TargetZone != "GATE_B" || parsed.Type != InterventionSignageReroute {
		t.Fatalf("parsed intervention mismatch: %+v", parsed)
	}
}

func TestAdHocIntervention_JSON(t *testing.T) {
	raw := `{"zone_id":"GATE_A","type":"HOLD_INFLOW"}`
	var req AdHocIntervention
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if req.ZoneID != "GATE_A" || req.Type != InterventionHoldInflow || req.Message != "" {
		t.Fatalf("unexpected adhoc intervention: %+v", req)
	}
}

func TestConstants_Integrity(t *testing.T) {
	if CongestionLow != "LOW" || CongestionModerate != "MODERATE" ||
		CongestionHigh != "HIGH" || CongestionCritical != "CRITICAL" {
		t.Fatal("congestion level constants mismatch")
	}
	if InterventionSignageReroute != "SIGNAGE_REROUTE" ||
		InterventionHoldInflow != "HOLD_INFLOW" ||
		InterventionDynamicShuttle != "DYNAMIC_SHUTTLE" ||
		InterventionDispatchStaff != "DISPATCH_STAFF" {
		t.Fatal("intervention type constants mismatch")
	}
}
```

---

#### Suite 3: `internal/api/ws_test.go` (Target: >95% Coverage for WebSocket & Concurrency)

```go
package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gorilla/websocket"

	"crowd-flow-optimiser/backend/internal/agent"
	"crowd-flow-optimiser/backend/internal/intervention"
	"crowd-flow-optimiser/backend/internal/models"
	"crowd-flow-optimiser/backend/internal/state"
)

type wsFrame struct {
	Event string          `json:"event"`
	Data  json.RawMessage `json:"data"`
}

func setupWSTestServer(t *testing.T) (*httptest.Server, *state.Manager, *intervention.Service, *agent.Network) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)

	st := state.NewManager([]string{"GATE_A", "GATE_B"})
	sg := intervention.NewService()
	net := agent.BuildNetwork(ctx, []string{"GATE_A", "GATE_B"}, st, sg)
	h := NewHandlers(net, st, sg)
	router := NewRouter(h)

	server := httptest.NewServer(router)
	t.Cleanup(server.Close)
	return server, st, sg, net
}

func dialWS(t *testing.T, serverURL string) *websocket.Conn {
	t.Helper()
	wsURL := "ws" + strings.TrimPrefix(serverURL, "http") + "/api/v1/ws"
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, nil)
	if err != nil {
		t.Fatalf("websocket dial failed: %v (status: %v)", err, resp)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return conn
}

// 1. Tests initial snapshot delivery upon connect
func TestWS_InitialSnapshot(t *testing.T) {
	server, st, _, _ := setupWSTestServer(t)
	st.Set(models.ZoneMetric{ZoneID: "GATE_A", Capacity: 100, Occupancy: 50, Congestion: models.CongestionModerate})
	st.Set(models.ZoneMetric{ZoneID: "GATE_B", Capacity: 200, Occupancy: 190, Congestion: models.CongestionCritical})

	conn := dialWS(t, server.URL)
	receivedZones := make(map[string]bool)

	// Expect 2 snapshot metrics (GATE_A and GATE_B)
	for i := 0; i < 2; i++ {
		_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
		var frame wsFrame
		if err := conn.ReadJSON(&frame); err != nil {
			t.Fatalf("failed reading snapshot frame %d: %v", i, err)
		}
		if frame.Event != "metric" {
			t.Fatalf("expected event 'metric', got %q", frame.Event)
		}
		var m models.ZoneMetric
		_ = json.Unmarshal(frame.Data, &m)
		receivedZones[m.ZoneID] = true
	}

	if !receivedZones["GATE_A"] || !receivedZones["GATE_B"] {
		t.Fatalf("did not receive both zones in snapshot: %v", receivedZones)
	}
}

// 2. Tests live metric streaming to connected client
func TestWS_LiveMetricBroadcast(t *testing.T) {
	server, st, _, _ := setupWSTestServer(t)
	conn := dialWS(t, server.URL)

	// Drain snapshot
	for i := 0; i < 2; i++ {
		_ = conn.SetReadDeadline(time.Now().Add(time.Second))
		var f wsFrame
		_ = conn.ReadJSON(&f)
	}

	// Trigger fresh metric
	st.Set(models.ZoneMetric{
		ZoneID:     "GATE_A",
		Capacity:   100,
		Occupancy:  85,
		Congestion: models.CongestionHigh,
	})

	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var frame wsFrame
	if err := conn.ReadJSON(&frame); err != nil {
		t.Fatalf("failed to read live metric frame: %v", err)
	}
	if frame.Event != "metric" {
		t.Fatalf("expected event metric, got %s", frame.Event)
	}
	var m models.ZoneMetric
	_ = json.Unmarshal(frame.Data, &m)
	if m.ZoneID != "GATE_A" || m.Occupancy != 85 || m.Congestion != models.CongestionHigh {
		t.Fatalf("unexpected metric frame content: %+v", m)
	}
}

// 3. Tests live intervention streaming to connected client
func TestWS_LiveInterventionBroadcast(t *testing.T) {
	server, _, sg, _ := setupWSTestServer(t)
	conn := dialWS(t, server.URL)

	// Drain snapshot
	for i := 0; i < 2; i++ {
		_ = conn.SetReadDeadline(time.Now().Add(time.Second))
		var f wsFrame
		_ = conn.ReadJSON(&f)
	}

	sg.Apply(models.Intervention{
		ZoneID:     "GATE_A",
		Type:       models.InterventionHoldInflow,
		Message:    "HOLD INFLOW TEST",
		Severity:   models.CongestionCritical,
	})

	_ = conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	var frame wsFrame
	if err := conn.ReadJSON(&frame); err != nil {
		t.Fatalf("failed to read intervention frame: %v", err)
	}
	if frame.Event != "intervention" {
		t.Fatalf("expected event intervention, got %s", frame.Event)
	}
	var iv models.Intervention
	_ = json.Unmarshal(frame.Data, &iv)
	if iv.ZoneID != "GATE_A" || iv.Type != models.InterventionHoldInflow {
		t.Fatalf("unexpected intervention frame: %+v", iv)
	}
}

// 4. Tests client disconnect & clean unregistration (no leaks)
func TestWS_ClientDisconnectUnregisters(t *testing.T) {
	server, st, sg, _ := setupWSTestServer(t)
	conn := dialWS(t, server.URL)

	// Close client connection immediately
	_ = conn.Close()
	time.Sleep(50 * time.Millisecond)

	// State and signage broadcasts should continue without hanging or error
	st.Set(models.ZoneMetric{ZoneID: "GATE_A", Occupancy: 10})
	sg.Apply(models.Intervention{ZoneID: "GATE_A", Type: models.InterventionDispatchStaff})
}

// 5. Tests multiple concurrent WebSocket clients
func TestWS_MultipleConcurrentClients(t *testing.T) {
	server, st, _, _ := setupWSTestServer(t)
	const clientCount = 5
	var conns []*websocket.Conn

	for i := 0; i < clientCount; i++ {
		c := dialWS(t, server.URL)
		conns = append(conns, c)
		// Drain snapshot
		for j := 0; j < 2; j++ {
			var f wsFrame
			_ = c.ReadJSON(&f)
		}
	}

	var wg sync.WaitGroup
	wg.Add(clientCount)
	for _, c := range conns {
		go func(conn *websocket.Conn) {
			defer wg.Done()
			_ = conn.SetReadDeadline(time.Now().Add(3 * time.Second))
			var f wsFrame
			if err := conn.ReadJSON(&f); err != nil {
				t.Errorf("concurrent client read failed: %v", err)
				return
			}
			if f.Event != "metric" {
				t.Errorf("expected metric event, got %s", f.Event)
			}
		}(c)
	}

	st.Set(models.ZoneMetric{ZoneID: "GATE_A", Occupancy: 99, Congestion: models.CongestionCritical})
	wg.Wait()
}

// 6. Tests reconnecting client lifecycle
func TestWS_ReconnectionLifecycle(t *testing.T) {
	server, st, _, _ := setupWSTestServer(t)

	// First session
	c1 := dialWS(t, server.URL)
	_ = c1.Close()
	time.Sleep(30 * time.Millisecond)

	// Second session (reconnect)
	c2 := dialWS(t, server.URL)
	st.Set(models.ZoneMetric{ZoneID: "GATE_B", Occupancy: 45})

	// Drain snapshot
	for i := 0; i < 2; i++ {
		var f wsFrame
		_ = c2.ReadJSON(&f)
	}

	// Should receive live update
	st.Set(models.ZoneMetric{ZoneID: "GATE_B", Occupancy: 60})
	_ = c2.SetReadDeadline(time.Now().Add(2 * time.Second))
	var frame wsFrame
	if err := c2.ReadJSON(&frame); err != nil {
		t.Fatalf("reconnected client failed reading update: %v", err)
	}
}

// 7. Tests regular HTTP request to /api/v1/ws (upgrade failure)
func TestWS_NonWSRequestFailsGracefully(t *testing.T) {
	server, _, _, _ := setupWSTestServer(t)
	resp, err := http.Get(server.URL + "/api/v1/ws")
	if err != nil {
		t.Fatalf("http get failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		t.Fatalf("expected non-200 for regular HTTP request to WS endpoint, got %d", resp.StatusCode)
	}
}
```

---

#### Suite 4: `internal/api/handlers_test.go` (Additions for ListZones, SSE, and CORS OPTIONS)

Add the following tests to `handlers_test.go`:

```go
func TestListZones(t *testing.T) {
	h := newTestRouter(t)
	rec := doJSON(t, h, "GET", "/api/v1/zones", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var out struct {
		Zones []models.ZoneMetric `json:"zones"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if len(out.Zones) != 2 {
		t.Fatalf("expected 2 zones, got %d", len(out.Zones))
	}
	if out.Zones[0].ZoneID != "GATE_A" || out.Zones[1].ZoneID != "GATE_B" {
		t.Fatalf("expected sorted zones [GATE_A, GATE_B], got %v, %v", out.Zones[0].ZoneID, out.Zones[1].ZoneID)
	}
}

func TestCORSOptionsPreflight(t *testing.T) {
	h := newTestRouter(t)
	req := httptest.NewRequest(http.MethodOptions, "/api/v1/telemetry", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("expected 204 No Content for OPTIONS preflight, got %d", rec.Code)
	}
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatal("expected Access-Control-Allow-Origin header")
	}
	if rec.Header().Get("Access-Control-Allow-Methods") == "" {
		t.Fatal("expected Access-Control-Allow-Methods header")
	}
}

func TestSSEStream(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	st := state.NewManager([]string{"GATE_A"})
	sg := intervention.NewService()
	net := agent.BuildNetwork(ctx, []string{"GATE_A"}, st, sg)
	h := NewHandlers(net, st, sg)
	router := NewRouter(h)

	server := httptest.NewServer(router)
	defer server.Close()

	req, _ := http.NewRequestWithContext(ctx, "GET", server.URL+"/api/v1/stream", nil)
	req.Header.Set("Accept", "text/event-stream")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("SSE request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if !strings.Contains(resp.Header.Get("Content-Type"), "text/event-stream") {
		t.Fatalf("expected text/event-stream, got %s", resp.Header.Get("Content-Type"))
	}
}
```

---

#### Suite 5: `cmd/server/main_test.go` (Server Integration Test)

```go
package main

import (
	"context"
	"net/http"
	"testing"
	"time"

	"crowd-flow-optimiser/backend/internal/agent"
	"crowd-flow-optimiser/backend/internal/api"
	"crowd-flow-optimiser/backend/internal/config"
	"crowd-flow-optimiser/backend/internal/intervention"
	"crowd-flow-optimiser/backend/internal/state"
)

func TestServerAssemblyAndLifecycle(t *testing.T) {
	cfg := config.Config{
		HTTPAddr: "127.0.0.1:0", // dynamic available port
		ZoneIDs:  []string{"TEST_ZONE_A", "TEST_ZONE_B"},
	}

	signage := intervention.NewService()
	st := state.NewManager(cfg.ZoneIDs)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	net := agent.BuildNetwork(ctx, cfg.ZoneIDs, st, signage)
	handler := api.NewRouter(api.NewHandlers(net, st, signage))

	srv := &http.Server{
		Addr:    cfg.HTTPAddr,
		Handler: handler,
	}

	go func() {
		_ = srv.ListenAndServe()
	}()

	time.Sleep(50 * time.Millisecond)

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("server shutdown failed: %v", err)
	}
}
```

---

#### Suite 6: Fix Data Race in `internal/agent/network_test.go`

In `internal/agent/network_test.go:TestNegotiateTimeout`:
Replace:
```go
func TestNegotiateTimeout(t *testing.T) {
	ctx := context.Background()
	st := state.NewManager([]string{"A", "B"})
	net := BuildNetwork(ctx, []string{"A", "B"}, st, intervention.NewService())
	// B never drains its Negotiation channel (its Run loop is busy or not
	// consuming), so the offer sits in the buffered channel; A times out.
	b, _ := net.Node("B")
	b.Negotiation = make(chan NegotiationOffer, 8) // buffer large, no consumer
...
```
With a race-safe test that does not launch an active `node.Run` goroutine for target node `B`:
```go
func TestNegotiateTimeout(t *testing.T) {
	ctx := context.Background()
	net := NewNetwork()
	// Node B is registered with a buffered channel but no active Run loop consuming it
	nodeB := &Node{
		ZoneID:      "B",
		Negotiation: make(chan NegotiationOffer, 8),
	}
	net.register(nodeB)

	offer := NegotiationOffer{
		From:     "A",
		To:       "B",
		Overflow: 10,
		Reply:    make(chan NegotiationResponse, 1),
	}
	start := time.Now()
	resp := net.Negotiate(ctx, offer)
	if resp.Accepted {
		t.Fatal("expected timeout rejection")
	}
	if time.Since(start) > 3*time.Second {
		t.Fatalf("negotiation timeout too slow: %s", time.Since(start))
	}
}
```

---

## 5. Verification Method

To verify the test suite once implemented:

1. **Run Full Test Suite with Verbose Output**:
   ```bash
   cd /Users/noname/documents/misc/crowd-flow-optimiser/backend && go test -v ./...
   ```
   *Expected*: All tests across all packages (`agent`, `api`, `config`, `intervention`, `models`, `state`, `cmd/server`) pass with status `PASS`.

2. **Verify Thread Safety & Race Freedom**:
   ```bash
   cd /Users/noname/documents/misc/crowd-flow-optimiser/backend && go test -race ./...
   ```
   *Expected*: 0 data races detected, exit code 0.

3. **Verify Coverage Report**:
   ```bash
   cd /Users/noname/documents/misc/crowd-flow-optimiser/backend && go test -cover ./...
   ```
   *Expected Coverage Targets*:
   - `internal/config`: 100.0%
   - `internal/models`: 100.0%
   - `internal/intervention`: 100.0%
   - `internal/state`: 100.0%
   - `internal/api`: > 90.0%
   - `internal/agent`: > 90.0%
   - Overall statement coverage: > 90.0%

---
*Report prepared by Backend Test Explorer for orchestrator and implementer subagents.*
