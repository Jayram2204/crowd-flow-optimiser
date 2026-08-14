package state

import (
	"sync"
	"time"

	"crowd-flow-optimiser/backend/internal/models"
)

// Manager is the single source of truth for the live telemetry of every
// zone. It is deliberately dumb: agents own decisions, the manager owns
// facts. It fans fresh metrics out to SSE subscribers without blocking.
type Manager struct {
	mu      sync.RWMutex
	metrics map[string]models.ZoneMetric
	subs    map[chan models.ZoneMetric]struct{}
}

// NewManager initialises every zone with a zeroed metric so the UI never
// renders an undefined state.
func NewManager(zoneIDs []string) *Manager {
	m := &Manager{
		metrics: make(map[string]models.ZoneMetric, len(zoneIDs)),
		subs:    make(map[chan models.ZoneMetric]struct{}),
	}
	for _, id := range zoneIDs {
		m.metrics[id] = models.ZoneMetric{ZoneID: id, Timestamp: time.Now()}
	}
	return m
}

// Set stores the freshest telemetry for a zone and broadcasts it.
func (m *Manager) Set(metric models.ZoneMetric) {
	m.mu.Lock()
	m.metrics[metric.ZoneID] = metric
	subs := make([]chan models.ZoneMetric, 0, len(m.subs))
	for c := range m.subs {
		subs = append(subs, c)
	}
	m.mu.Unlock()
	for _, c := range subs {
		select {
		case c <- metric:
		default: // slow consumer; drop. never block the ingest path.
		}
	}
}

// Get returns the latest metric for a single zone.
func (m *Manager) Get(zoneID string) (models.ZoneMetric, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	v, ok := m.metrics[zoneID]
	return v, ok
}

// All returns a snapshot of every zone's latest metric.
func (m *Manager) All() []models.ZoneMetric {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]models.ZoneMetric, 0, len(m.metrics))
	for _, v := range m.metrics {
		out = append(out, v)
	}
	return out
}

// Subscribe registers an SSE fan-out channel. The returned unsubscribe
// function must be called when the client disconnects.
func (m *Manager) Subscribe() (<-chan models.ZoneMetric, func()) {
	ch := make(chan models.ZoneMetric, 64)
	m.mu.Lock()
	m.subs[ch] = struct{}{}
	m.mu.Unlock()
	return ch, func() {
		m.mu.Lock()
		delete(m.subs, ch)
		m.mu.Unlock()
	}
}
