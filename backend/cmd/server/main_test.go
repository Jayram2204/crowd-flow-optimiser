package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"testing"
	"time"

	"crowd-flow-optimiser/backend/internal/agent"
	"crowd-flow-optimiser/backend/internal/api"
	"crowd-flow-optimiser/backend/internal/config"
	"crowd-flow-optimiser/backend/internal/intervention"
	"crowd-flow-optimiser/backend/internal/models"
	"crowd-flow-optimiser/backend/internal/state"
)

func TestServerAssemblyAndLifecycle(t *testing.T) {
	cfg := config.Config{
		HTTPAddr: "127.0.0.1:0",
		ZoneIDs:  []string{"TEST_ZONE_A", "TEST_ZONE_B"},
	}

	signage := intervention.NewService()
	st := state.NewManager(cfg.ZoneIDs)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	netAgent := agent.BuildNetwork(ctx, cfg.ZoneIDs, st, signage)
	handler := api.NewRouter(api.NewHandlers(netAgent, st, signage))

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen: %v", err)
	}
	defer listener.Close()

	go func() {
		_ = srv.Serve(listener)
	}()

	serverURL := fmt.Sprintf("http://%s", listener.Addr().String())

	// Test GET /healthz
	resp, err := http.Get(serverURL + "/healthz")
	if err != nil {
		t.Fatalf("failed to query /healthz: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 from healthz, got %d", resp.StatusCode)
	}

	// Test POST /api/v1/telemetry
	batch := models.TelemetryBatch{
		Zones: []models.ZoneMetric{
			{
				ZoneID:     "TEST_ZONE_A",
				Capacity:   100,
				Occupancy:  50,
				Congestion: models.CongestionModerate,
			},
		},
	}
	batchJSON, _ := json.Marshal(batch)
	postResp, err := http.Post(serverURL+"/api/v1/telemetry", "application/json", bytes.NewReader(batchJSON))
	if err != nil {
		t.Fatalf("failed to post telemetry: %v", err)
	}
	defer postResp.Body.Close()
	if postResp.StatusCode != http.StatusAccepted {
		t.Fatalf("expected 202 from telemetry, got %d", postResp.StatusCode)
	}

	// Test GET /api/v1/zones
	zonesResp, err := http.Get(serverURL + "/api/v1/zones")
	if err != nil {
		t.Fatalf("failed to get zones: %v", err)
	}
	defer zonesResp.Body.Close()
	if zonesResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 from zones, got %d", zonesResp.StatusCode)
	}

	// Trigger graceful shutdown
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		t.Fatalf("server shutdown failed: %v", err)
	}
}
