package agent

import (
	"context"
	"testing"
	"time"

	"crowd-flow-optimiser/backend/internal/intervention"
	"crowd-flow-optimiser/backend/internal/models"
	"crowd-flow-optimiser/backend/internal/state"
)

func TestBuildNetworkRegistersRingAdjacency(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	st := state.NewManager([]string{"A", "B", "C"})
	net := BuildNetwork(ctx, []string{"A", "B", "C"}, st, intervention.NewService())

	a, ok := net.Node("A")
	if !ok {
		t.Fatal("expected node A")
	}
	if len(a.Neighbors) != 2 {
		t.Fatalf("expected 2 neighbors, got %v", a.Neighbors)
	}
	// Ring: A <-> C and A <-> B.
	if !contains(a.Neighbors, "B") || !contains(a.Neighbors, "C") {
		t.Fatalf("unexpected adjacency for A: %v", a.Neighbors)
	}
}

func TestNegotiateUnknownTarget(t *testing.T) {
	ctx := context.Background()
	net := NewNetwork()
	resp := net.Negotiate(ctx, NegotiationOffer{From: "A", To: "GHOST"})
	if resp.Accepted {
		t.Fatal("negotiation to unknown zone must be rejected")
	}
}

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

func TestDeliverDropsWhenSaturated(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	st := state.NewManager([]string{"A"})
	net := BuildNetwork(ctx, []string{"A"}, st, intervention.NewService())

	a, _ := net.Node("A")
	// Fill the inbox buffer completely; there is no consumer draining it.
	for i := 0; i < cap(a.Inbox); i++ {
		a.Inbox <- models.ZoneMetric{ZoneID: "A"}
	}
	// Deliver must not block even when saturated.
	done := make(chan struct{})
	go func() {
		net.Deliver(models.ZoneMetric{ZoneID: "A", Occupancy: 1})
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("Deliver blocked on saturated inbox")
	}
}

func contains(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}
