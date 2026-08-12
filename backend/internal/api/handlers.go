package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sort"
	"time"

	"crowd-flow-optimiser/backend/internal/agent"
	"crowd-flow-optimiser/backend/internal/intervention"
	"crowd-flow-optimiser/backend/internal/models"
	"crowd-flow-optimiser/backend/internal/state"
)

// Handlers binds the HTTP surface to the agent network, state manager and
// signage service.
type Handlers struct {
	net     *agent.Network
	state   *state.Manager
	signage *intervention.Service
}

func NewHandlers(net *agent.Network, st *state.Manager, sg *intervention.Service) *Handlers {
	return &Handlers{net: net, state: st, signage: sg}
}

// ---- Telemetry ingest ---------------------------------------------------

func (h *Handlers) handleTelemetry(w http.ResponseWriter, r *http.Request) {
	var batch models.TelemetryBatch
	if err := json.NewDecoder(r.Body).Decode(&batch); err != nil {
		writeError(w, http.StatusBadRequest, "invalid telemetry payload: "+err.Error())
		return
	}
	if len(batch.Zones) == 0 {
		writeError(w, http.StatusBadRequest, "empty telemetry batch")
		return
	}
	// 1. Facts go to the state manager immediately (freshest UI truth).
	// 2. Decisions go to the owning zone agent's inbox (non-blocking).
	for _, m := range batch.Zones {
		if m.Timestamp.IsZero() {
			m.Timestamp = time.Now()
		}
		h.state.Set(m)
		h.net.Deliver(m)
	}
	writeJSON(w, http.StatusAccepted, map[string]any{
		"accepted": len(batch.Zones),
		"status":   "ingested",
	})
}

// ---- Zone state ----------------------------------------------------------

func (h *Handlers) handleListZones(w http.ResponseWriter, r *http.Request) {
	zones := h.state.All()
	sort.Slice(zones, func(i, j int) bool { return zones[i].ZoneID < zones[j].ZoneID })
	writeJSON(w, http.StatusOK, map[string]any{"zones": zones})
}

func (h *Handlers) handleGetZone(w http.ResponseWriter, r *http.Request) {
	zone := r.PathValue("zone")
	m, ok := h.state.Get(zone)
	if !ok {
		writeError(w, http.StatusNotFound, "unknown zone: "+zone)
		return
	}
	writeJSON(w, http.StatusOK, m)
}

// ---- Interventions -------------------------------------------------------

func (h *Handlers) handleListInterventions(w http.ResponseWriter, r *http.Request) {
	logs := h.signage.List()
	// newest first
	sort.Slice(logs, func(i, j int) bool { return logs[i].AppliedAt.After(logs[j].AppliedAt) })
	writeJSON(w, http.StatusOK, map[string]any{"interventions": logs})
}

func (h *Handlers) handleApplyIntervention(w http.ResponseWriter, r *http.Request) {
	var req models.AdHocIntervention
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid intervention payload: "+err.Error())
		return
	}
	if req.ZoneID == "" || req.Type == "" {
		writeError(w, http.StatusBadRequest, "zone_id and type are required")
		return
	}
	iv := h.signage.Apply(models.Intervention{
		ZoneID:   req.ZoneID,
		Type:     req.Type,
		Message:  req.Message,
		Severity: models.CongestionHigh, // manual overrides are, by definition, pressing
	})
	writeJSON(w, http.StatusCreated, iv)
}

// ---- Live stream (SSE) ---------------------------------------------------

func (h *Handlers) handleStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	ctx := r.Context()
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	sub, unsub := h.state.Subscribe()
	defer unsub()

	// Push a full snapshot immediately so the terminal boots with state.
	for _, m := range h.state.All() {
		h.writeSSE(w, flusher, "snapshot", m)
	}

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case m := <-sub:
			h.writeSSE(w, flusher, "metric", m)
		case <-ticker.C:
			_, _ = fmt.Fprintf(w, ": heartbeat\n\n")
			flusher.Flush()
		}
	}
}

func (h *Handlers) writeSSE(w http.ResponseWriter, flusher http.Flusher, event string, m models.ZoneMetric) {
	payload, err := json.Marshal(m)
	if err != nil {
		log.Printf("[sse] marshal error: %v", err)
		return
	}
	if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, payload); err != nil {
		return
	}
	flusher.Flush()
}

// ---- Misc ----------------------------------------------------------------

func handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"service": "crowd-flow-optimiser-backend",
		"status":  "ok",
		"time":    time.Now().UTC().Format(time.RFC3339),
	})
}

func handleRoot(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"name": "Crowd Flow Optimiser",
		"tagline": "monitoring a dashboard doesn't save lives; executing interventions does",
		"endpoints": []string{
			"POST /api/v1/telemetry",
			"GET  /api/v1/zones",
			"GET  /api/v1/zones/{zone}",
			"GET  /api/v1/interventions",
			"POST /api/v1/interventions",
			"GET  /api/v1/stream",
			"GET  /healthz",
		},
	})
}

// ---- helpers ---------------------------------------------------------------

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]any{"error": msg})
}
