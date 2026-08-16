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
	sg := intervention.NewService(nil, nil)
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
		if err := json.Unmarshal(frame.Data, &m); err != nil {
			t.Fatalf("failed unmarshaling metric frame: %v", err)
		}
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
		if err := conn.ReadJSON(&f); err != nil {
			t.Fatalf("failed reading initial snapshot frame: %v", err)
		}
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
	if err := json.Unmarshal(frame.Data, &m); err != nil {
		t.Fatalf("failed unmarshaling live metric: %v", err)
	}
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
		if err := conn.ReadJSON(&f); err != nil {
			t.Fatalf("failed draining snapshot frame: %v", err)
		}
	}

	sg.Apply(models.Intervention{
		ZoneID:   "GATE_A",
		Type:     models.InterventionHoldInflow,
		Message:  "HOLD INFLOW TEST",
		Severity: models.CongestionCritical,
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
	if err := json.Unmarshal(frame.Data, &iv); err != nil {
		t.Fatalf("failed unmarshaling intervention: %v", err)
	}
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
			if err := c.ReadJSON(&f); err != nil {
				t.Fatalf("failed draining snapshot: %v", err)
			}
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
	time.Sleep(50 * time.Millisecond)

	// Second session (reconnect)
	c2 := dialWS(t, server.URL)
	st.Set(models.ZoneMetric{ZoneID: "GATE_B", Occupancy: 45})

	// Drain snapshot
	for i := 0; i < 2; i++ {
		var f wsFrame
		if err := c2.ReadJSON(&f); err != nil {
			t.Fatalf("failed draining snapshot: %v", err)
		}
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
