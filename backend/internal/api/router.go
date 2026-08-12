package api

import (
	"log"
	"net/http"
	"time"
)

// NewRouter assembles the full HTTP surface with middleware: request
// logging and permissive CORS for local development.
func NewRouter(h *Handlers) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /", handleRoot)
	mux.HandleFunc("GET /healthz", handleHealth)

	mux.HandleFunc("POST /api/v1/telemetry", h.handleTelemetry)
	mux.HandleFunc("GET /api/v1/zones", h.handleListZones)
	mux.HandleFunc("GET /api/v1/zones/{zone}", h.handleGetZone)
	mux.HandleFunc("GET /api/v1/interventions", h.handleListInterventions)
	mux.HandleFunc("POST /api/v1/interventions", h.handleApplyIntervention)
	mux.HandleFunc("GET /api/v1/stream", h.handleStream)

	return cors(logger(mux))
}

func cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("%s %s (%s)", r.Method, r.URL.Path, time.Since(start))
	})
}
