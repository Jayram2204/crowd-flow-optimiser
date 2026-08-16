package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"crowd-flow-optimiser/backend/internal/agent"
	"crowd-flow-optimiser/backend/internal/api"
	"crowd-flow-optimiser/backend/internal/config"
	"crowd-flow-optimiser/backend/internal/intervention"
	"crowd-flow-optimiser/backend/internal/state"
)

func main() {
	cfg := config.Load()

	st := state.NewManager(cfg.ZoneIDs)
	signage := intervention.NewService(st.Get, nil)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Spin up one autonomous goroutine per zone. This is the whole point:
	// N independent decision-makers, not one monolithic simulation.
	net := agent.BuildNetwork(ctx, cfg.ZoneIDs, st, signage)

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           api.NewRouter(api.NewHandlers(net, st, signage)),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("[backend] Crowd Flow Optimiser listening on %s with %d zone agents", cfg.HTTPAddr, len(cfg.ZoneIDs))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("[backend] fatal: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	log.Printf("[backend] draining...")
	cancel()
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()
	_ = srv.Shutdown(shutdownCtx)
	log.Printf("[backend] bye.")
}
