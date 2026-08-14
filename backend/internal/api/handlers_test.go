package api

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"crowd-flow-optimiser/backend/internal/agent"
	"crowd-flow-optimiser/backend/internal/intervention"
	"crowd-flow-optimiser/backend/internal/models"
	"crowd-flow-optimiser/backend/internal/state"
)

func newTestRouter(t *testing.T) http.Handler {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	st := state.NewManager([]string{"GATE_A", "GATE_B"})
	sg := intervention.NewService()
	net := agent.BuildNetwork(ctx, []string{"GATE_A", "GATE_B"}, st, sg)
	return NewRouter(NewHandlers(net, st, sg))
}

func doJSON(t *testing.T, h http.Handler, method, path string, body any) *httptest.ResponseRecorder {
	t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if err := json.NewEncoder(&buf).Encode(body); err != nil {
			t.Fatalf("encode body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestRootListsEndpoints(t *testing.T) {
	h := newTestRouter(t)
	rec := doJSON(t, h, "GET", "/", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if _, ok := out["endpoints"]; !ok {
		t.Fatal("root response missing endpoints list")
	}
}

func TestTelemetryIngestUpdatesZones(t *testing.T) {
	h := newTestRouter(t)
	batch := models.TelemetryBatch{
		Zones: []models.ZoneMetric{{
			ZoneID:     "GATE_A",
			Capacity:   100,
			Occupancy:  90,
			Density:    0.9,
			Congestion: models.CongestionHigh,
		}},
	}
	rec := doJSON(t, h, "POST", "/api/v1/telemetry", batch)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected 202, got %d: %s", rec.Code, rec.Body.String())
	}

	rec = doJSON(t, h, "GET", "/api/v1/zones/GATE_A", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var m models.ZoneMetric
	_ = json.Unmarshal(rec.Body.Bytes(), &m)
	if m.Occupancy != 90 || m.Congestion != models.CongestionHigh {
		t.Fatalf("zone not updated by ingest: %+v", m)
	}
}

func TestTelemetryRejectsEmptyBatch(t *testing.T) {
	h := newTestRouter(t)
	rec := doJSON(t, h, "POST", "/api/v1/telemetry", models.TelemetryBatch{Zones: []models.ZoneMetric{}})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty batch, got %d", rec.Code)
	}
}

func TestTelemetryRejectsMalformedBody(t *testing.T) {
	h := newTestRouter(t)
	req := httptest.NewRequest("POST", "/api/v1/telemetry", bytes.NewBufferString("{not json"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for malformed body, got %d", rec.Code)
	}
}

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

func TestGetUnknownZone404(t *testing.T) {
	h := newTestRouter(t)
	rec := doJSON(t, h, "GET", "/api/v1/zones/UNKNOWN", nil)
	if rec.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d", rec.Code)
	}
}

func TestApplyIntervention(t *testing.T) {
	h := newTestRouter(t)
	rec := doJSON(t, h, "POST", "/api/v1/interventions", models.AdHocIntervention{
		ZoneID:  "GATE_A",
		Type:    models.InterventionSignageReroute,
		Message: "manual test override",
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
	var iv models.Intervention
	_ = json.Unmarshal(rec.Body.Bytes(), &iv)
	if iv.ID == "" || iv.ZoneID != "GATE_A" {
		t.Fatalf("unexpected intervention response: %+v", iv)
	}

	rec = doJSON(t, h, "GET", "/api/v1/interventions", nil)
	var out struct {
		Interventions []models.Intervention `json:"interventions"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if len(out.Interventions) != 1 {
		t.Fatalf("expected 1 intervention in log, got %d", len(out.Interventions))
	}
}

func TestApplyInterventionRequiresFields(t *testing.T) {
	h := newTestRouter(t)
	rec := doJSON(t, h, "POST", "/api/v1/interventions", models.AdHocIntervention{ZoneID: "GATE_A"})
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when type missing, got %d", rec.Code)
	}
}

func TestApplyInterventionMalformedBody(t *testing.T) {
	h := newTestRouter(t)
	req := httptest.NewRequest("POST", "/api/v1/interventions", bytes.NewBufferString("{invalid json"))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for malformed json, got %d", rec.Code)
	}
}

func TestGetZoneSuccess(t *testing.T) {
	h := newTestRouter(t)
	rec := doJSON(t, h, "GET", "/api/v1/zones/GATE_A", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var m models.ZoneMetric
	if err := json.Unmarshal(rec.Body.Bytes(), &m); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if m.ZoneID != "GATE_A" {
		t.Fatalf("expected GATE_A, got %s", m.ZoneID)
	}
}

func TestListInterventions_Sorting(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	st := state.NewManager([]string{"GATE_A"})
	sg := intervention.NewService()
	net := agent.BuildNetwork(ctx, []string{"GATE_A"}, st, sg)
	h := NewHandlers(net, st, sg)
	router := NewRouter(h)

	sg.Apply(models.Intervention{ZoneID: "GATE_A", Type: models.InterventionHoldInflow, AppliedAt: time.Now().Add(-1 * time.Hour)})
	sg.Apply(models.Intervention{ZoneID: "GATE_A", Type: models.InterventionDispatchStaff, AppliedAt: time.Now()})

	rec := doJSON(t, router, "GET", "/api/v1/interventions", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var out struct {
		Interventions []models.Intervention `json:"interventions"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if len(out.Interventions) != 2 {
		t.Fatalf("expected 2 interventions, got %d", len(out.Interventions))
	}
	if out.Interventions[0].Type != models.InterventionDispatchStaff {
		t.Fatalf("expected newest intervention first, got %s", out.Interventions[0].Type)
	}
}

func TestHealthz(t *testing.T) {
	h := newTestRouter(t)
	rec := doJSON(t, h, "GET", "/healthz", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	if out["service"] != "crowd-flow-optimiser-backend" {
		t.Fatalf("unexpected health payload: %v", out)
	}
}

func TestCORSHeaderPresent(t *testing.T) {
	h := newTestRouter(t)
	rec := doJSON(t, h, "GET", "/healthz", nil)
	if rec.Header().Get("Access-Control-Allow-Origin") != "*" {
		t.Fatal("expected permissive CORS header on API responses")
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
	if rec.Header().Get("Access-Control-Allow-Headers") == "" {
		t.Fatal("expected Access-Control-Allow-Headers header")
	}
}

func TestSSEStream(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	st := state.NewManager([]string{"GATE_A", "GATE_B"})
	st.Set(models.ZoneMetric{ZoneID: "GATE_A", Capacity: 100, Occupancy: 50, Congestion: models.CongestionModerate})
	sg := intervention.NewService()
	net := agent.BuildNetwork(ctx, []string{"GATE_A", "GATE_B"}, st, sg)
	h := NewHandlers(net, st, sg)
	router := NewRouter(h)

	server := httptest.NewServer(router)
	defer server.Close()

	reqCtx, reqCancel := context.WithCancel(context.Background())
	defer reqCancel()

	req, err := http.NewRequestWithContext(reqCtx, "GET", server.URL+"/api/v1/stream", nil)
	if err != nil {
		t.Fatalf("failed creating SSE request: %v", err)
	}
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

	reader := bufio.NewReader(resp.Body)
	line, err := reader.ReadString('\n')
	if err != nil {
		t.Fatalf("failed reading SSE stream line: %v", err)
	}
	if !strings.HasPrefix(line, "event:") {
		t.Fatalf("unexpected SSE first line: %s", line)
	}

	// Send metric and intervention during stream
	st.Set(models.ZoneMetric{ZoneID: "GATE_A", Occupancy: 80, Congestion: models.CongestionHigh})
	sg.Apply(models.Intervention{ZoneID: "GATE_A", Type: models.InterventionHoldInflow})

	// Close context to end stream
	reqCancel()
}

type nonFlusherResponseWriter struct {
	header http.Header
	code   int
	buf    bytes.Buffer
}

func (n *nonFlusherResponseWriter) Header() http.Header {
	if n.header == nil {
		n.header = make(http.Header)
	}
	return n.header
}

func (n *nonFlusherResponseWriter) Write(b []byte) (int, error) {
	return n.buf.Write(b)
}

func (n *nonFlusherResponseWriter) WriteHeader(statusCode int) {
	n.code = statusCode
}

func TestSSEStream_NonFlusher(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	st := state.NewManager([]string{"GATE_A"})
	sg := intervention.NewService()
	net := agent.BuildNetwork(ctx, []string{"GATE_A"}, st, sg)
	h := NewHandlers(net, st, sg)

	req := httptest.NewRequest("GET", "/api/v1/stream", nil)
	rec := &nonFlusherResponseWriter{}
	h.handleStream(rec, req)

	if rec.code != http.StatusInternalServerError {
		t.Fatalf("expected 500 for non-flusher ResponseWriter, got %d", rec.code)
	}
}
