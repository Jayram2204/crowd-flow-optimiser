package api

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
)

// upgrader permits cross-origin local development (terminal UI on :3000,
// backend on :8080). Tighten this to a host allowlist in production.
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// handleStreamWS streams live zone telemetry to the terminal UI over a
// WebSocket. It mirrors the SSE fan-out: full snapshot on connect, then one
// message per zone update. Every frame is an envelope — {"event","data"} —
// so metrics and interventions route to different consumers. Frontends
// prefer WS for the two-way ping/pong liveness and reconnect semantics.
func (h *Handlers) handleStreamWS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[ws] upgrade error: %v", err)
		return
	}
	defer conn.Close()
	conn.SetReadLimit(4096)

	sub, unsub := h.state.Subscribe()
	defer unsub()
	ivSub, unsubIv := h.signage.Subscribe()
	defer unsubIv()

	for _, m := range h.state.All() {
		if err := writeWSFrame(conn, "metric", m); err != nil {
			return
		}
	}

	// Drain inbound frames so we notice client disconnects and can re-enqueue
	// that subscriber slot instead of leaking it.
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-done:
			return
		case m := <-sub:
			if err := writeWSFrame(conn, "metric", m); err != nil {
				return
			}
		case iv := <-ivSub:
			if err := writeWSFrame(conn, "intervention", iv); err != nil {
				return
			}
		case <-ticker.C:
			if err := conn.SetWriteDeadline(time.Now().Add(5 * time.Second)); err != nil {
				return
			}
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func writeWSFrame(conn *websocket.Conn, event string, data any) error {
	_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	payload, err := json.Marshal(map[string]any{"event": event, "data": data})
	if err != nil {
		return err
	}
	return conn.WriteMessage(websocket.TextMessage, payload)
}
