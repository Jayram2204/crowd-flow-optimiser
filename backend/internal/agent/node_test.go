package agent

import (
	"context"
	"testing"
	"time"

	"crowd-flow-optimiser/backend/internal/intervention"
	"crowd-flow-optimiser/backend/internal/models"
	"crowd-flow-optimiser/backend/internal/state"
)

func testMetric(zone string, occ, cap int, congestion models.CongestionLevel) models.ZoneMetric {
	return models.ZoneMetric{
		ZoneID:     zone,
		Occupancy:  occ,
		Capacity:   cap,
		Density:    float64(occ) / float64(cap),
		Congestion: congestion,
		Timestamp:  time.Now().UTC(),
	}
}

func TestCriticalZoneNegotiatesOverflow(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	zoneIDs := []string{"A", "B"}
	st := state.NewManager(zoneIDs)
	sg := intervention.NewService()
	net := BuildNetwork(ctx, zoneIDs, st, sg)
	b, _ := net.Node("B")
	b.Inbox <- testMetric("B", 30, 100, models.CongestionLow)
	time.Sleep(50 * time.Millisecond)

	// A trips CRITICAL with occupancy beyond capacity.
	a, _ := net.Node("A")
	a.Inbox <- testMetric("A", 120, 100, models.CongestionCritical)

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		for _, iv := range sg.List() {
			if iv.Type == models.InterventionSignageReroute && iv.TargetZone == "B" {
				return // negotiated overflow to B as expected
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("expected A to negotiate a SIGNAGE_REROUTE to B")
}

func TestHighZoneDoesNotIntervene(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	zoneIDs := []string{"A"}
	st := state.NewManager(zoneIDs)
	sg := intervention.NewService()
	net := BuildNetwork(ctx, zoneIDs, st, sg)

	a, _ := net.Node("A")
	a.Inbox <- testMetric("A", 85, 100, models.CongestionHigh)
	time.Sleep(100 * time.Millisecond)

	if n := len(sg.List()); n != 0 {
		t.Fatalf("HIGH alone must not trigger an intervention, got %d", n)
	}
}

func TestOnNegotiationAcceptsWithSpareCapacity(t *testing.T) {
	var applied []models.Intervention
	n := &Node{
		ZoneID: "B",
		last:   testMetric("B", 30, 100, models.CongestionLow),
		intervene: func(iv models.Intervention) {
			applied = append(applied, iv)
		},
	}
	reply := make(chan NegotiationResponse, 1)
	n.onNegotiation(NegotiationOffer{From: "A", To: "B", Overflow: 40, Reply: reply})

	resp := <-reply
	if !resp.Accepted {
		t.Fatalf("expected accept with spare 70 vs overflow 40: %s", resp.Message)
	}
	if len(applied) != 1 || applied[0].Type != models.InterventionSignageReroute {
		t.Fatalf("expected SIGNAGE_REROUTE intervention, got %+v", applied)
	}
}

func TestOnNegotiationRejectsWithoutSpare(t *testing.T) {
	n := &Node{
		ZoneID:     "B",
		last:       testMetric("B", 90, 100, models.CongestionHigh),
		intervene:  func(models.Intervention) {},
	}
	reply := make(chan NegotiationResponse, 1)
	n.onNegotiation(NegotiationOffer{From: "A", To: "B", Overflow: 40, Reply: reply})

	resp := <-reply
	if resp.Accepted {
		t.Fatalf("expected reject: spare 10 < overflow 40")
	}
}

func TestOnNegotiationRejectsWhenCritical(t *testing.T) {
	n := &Node{
		ZoneID:     "B",
		last:       testMetric("B", 110, 100, models.CongestionCritical),
		intervene:  func(models.Intervention) {},
	}
	reply := make(chan NegotiationResponse, 1)
	n.onNegotiation(NegotiationOffer{From: "A", To: "B", Overflow: 5, Reply: reply})

	resp := <-reply
	if resp.Accepted {
		t.Fatal("a CRITICAL zone must never accept overflow")
	}
}

func TestLeastLoadedNeighborPrefersLowestCongestion(t *testing.T) {
	st := state.NewManager([]string{"A", "B", "C"})
	st.Set(testMetric("B", 90, 100, models.CongestionHigh))
	st.Set(testMetric("C", 20, 100, models.CongestionLow))

	n := &Node{ZoneID: "A", Neighbors: []string{"B", "C"}, state: st}
	if got := n.leastLoadedNeighbor(); got != "C" {
		t.Fatalf("expected C (LOW) as least loaded, got %q", got)
	}
}

func TestShedLoadEscalatesWhenNoNeighbor(t *testing.T) {
	var applied []models.Intervention
	n := &Node{
		ZoneID:    "A",
		Neighbors: nil,
		intervene: func(iv models.Intervention) {
			applied = append(applied, iv)
		},
	}
	n.shedLoad(context.Background(), testMetric("A", 120, 100, models.CongestionCritical), 20)
	if len(applied) != 1 || applied[0].Type != models.InterventionDispatchStaff {
		t.Fatalf("expected DISPATCH_STAFF escalation, got %+v", applied)
	}
}

func TestRejectedRerouteDispatchesShuttle(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	// Ring A<->D, A<->B. B and D reject A's overflow; C (non-neighbour)
	// has real spare capacity, so the shuttle must carry people there.
	zoneIDs := []string{"A", "B", "C", "D"}
	st := state.NewManager(zoneIDs)
	sg := intervention.NewService()
	net := BuildNetwork(ctx, zoneIDs, st, sg)
	b, _ := net.Node("B")
	d, _ := net.Node("D")
	c, _ := net.Node("C")
	// Replicate the ingest path: facts first (state manager), then decision.
	st.Set(testMetric("B", 120, 100, models.CongestionCritical))
	st.Set(testMetric("D", 95, 100, models.CongestionHigh))
	st.Set(testMetric("C", 10, 400, models.CongestionLow))
	b.Inbox <- testMetric("B", 120, 100, models.CongestionCritical)
	d.Inbox <- testMetric("D", 95, 100, models.CongestionHigh)
	c.Inbox <- testMetric("C", 10, 400, models.CongestionLow)
	time.Sleep(50 * time.Millisecond)

	st.Set(testMetric("A", 120, 100, models.CongestionCritical))
	a, _ := net.Node("A")
	a.Inbox <- testMetric("A", 120, 100, models.CongestionCritical)

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		for _, iv := range sg.List() {
			if iv.ZoneID == "A" && iv.Type == models.InterventionDynamicShuttle && iv.TargetZone == "C" {
				return // shuttle dispatched to the distant spare zone
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("expected A to dispatch a DYNAMIC_SHUTTLE to C after neighbours rejected")
}

func TestShedLoadFallsBackToHoldInflow(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	zoneIDs := []string{"A", "B", "C", "D"}
	st := state.NewManager(zoneIDs)
	sg := intervention.NewService()
	net := BuildNetwork(ctx, zoneIDs, st, sg)
	for _, id := range []string{"B", "C", "D"} {
		m := testMetric(id, 120, 100, models.CongestionCritical)
		st.Set(m)
		node, _ := net.Node(id)
		node.Inbox <- m
	}
	time.Sleep(50 * time.Millisecond)

	st.Set(testMetric("A", 120, 100, models.CongestionCritical))
	a, _ := net.Node("A")
	a.Inbox <- testMetric("A", 120, 100, models.CongestionCritical)

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		for _, iv := range sg.List() {
			if iv.ZoneID == "A" && iv.Type == models.InterventionHoldInflow {
				return // nowhere could absorb; A's inflow is held
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("expected A to hold inflow when no zone anywhere can absorb the overflow")
}

func TestShuttleDestinationSkipsNeighborsAndSelf(t *testing.T) {
	st := state.NewManager([]string{"A", "B", "C"})
	st.Set(testMetric("A", 110, 100, models.CongestionCritical))
	st.Set(testMetric("B", 10, 400, models.CongestionLow)) // neighbour: must be skipped
	st.Set(testMetric("C", 10, 400, models.CongestionLow))
	n := &Node{ZoneID: "A", Neighbors: []string{"B"}, state: st}

	dest, ok := n.shuttleDestination(20)
	if !ok || dest != "C" {
		t.Fatalf("expected shuttle to C (non-neighbour), got %q ok=%v", dest, ok)
	}
	if _, ok := n.shuttleDestination(500); ok {
		t.Fatal("no zone has 500 spare; shuttleDestination must report false")
	}
}
