package state

import (
	"testing"
	"time"

	"crowd-flow-optimiser/backend/internal/models"
)

func metric(zone string, occ, cap int) models.ZoneMetric {
	return models.ZoneMetric{
		ZoneID:     zone,
		Occupancy:  occ,
		Capacity:   cap,
		Density:    float64(occ) / float64(cap),
		Congestion: models.CongestionLevel(level(occ, cap)),
		Timestamp:  time.Now().UTC(),
	}
}

func level(occ, cap int) string {
	d := float64(occ) / float64(cap)
	switch {
	case d >= 1.0:
		return "CRITICAL"
	case d >= 0.8:
		return "HIGH"
	case d >= 0.5:
		return "MODERATE"
	default:
		return "LOW"
	}
}

func TestNewManagerSeedsAllZones(t *testing.T) {
	m := NewManager([]string{"A", "B"})
	if len(m.All()) != 2 {
		t.Fatalf("expected 2 seeded metrics, got %d", len(m.All()))
	}
	if _, ok := m.Get("A"); !ok {
		t.Fatal("expected zone A to exist after NewManager")
	}
	if _, ok := m.Get("NOPE"); ok {
		t.Fatal("unknown zone should not be reported as present")
	}
}

func TestSetGetRoundTrip(t *testing.T) {
	m := NewManager([]string{"A"})
	mm := metric("A", 40, 50)
	m.Set(mm)
	got, ok := m.Get("A")
	if !ok {
		t.Fatal("expected zone A present")
	}
	if got.Occupancy != 40 || got.Congestion != models.CongestionHigh {
		t.Fatalf("unexpected metric: %+v", got)
	}
}

func TestSetBroadcastsToSubscriber(t *testing.T) {
	m := NewManager([]string{"A"})
	sub, unsub := m.Subscribe()
	defer unsub()

	mm := metric("A", 80, 100)
	m.Set(mm)

	select {
	case got := <-sub:
		if got.ZoneID != "A" {
			t.Fatalf("unexpected broadcast: %+v", got)
		}
	case <-time.After(time.Second):
		t.Fatal("subscriber did not receive broadcast")
	}
}

func TestSlowConsumerDroppedNotBlocked(t *testing.T) {
	m := NewManager([]string{"A"})
	sub, unsub := m.Subscribe()
	// Never drain the subscriber; after 64 messages the channel buffers fill.
	for i := 0; i < 100; i++ {
		m.Set(metric("A", i, 100))
	}
	unsub()
	select {
	case <-sub:
		// still buffered messages may be read; that's fine
	default:
	}
	// The important assertion: Set never blocked and the ingest path is intact.
	if _, ok := m.Get("A"); !ok {
		t.Fatal("state manager should remain functional after slow consumer")
	}
}

func TestUnsubscribeStopsDelivery(t *testing.T) {
	m := NewManager([]string{"A"})
	sub, unsub := m.Subscribe()
	unsub()
	m.Set(metric("A", 10, 100))
	select {
	case got := <-sub:
		t.Fatalf("received %+v after unsubscribe", got)
	case <-time.After(50 * time.Millisecond):
		// expected: no delivery
	}
}
