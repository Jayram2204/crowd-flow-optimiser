package agent

import (
	"context"
	"fmt"
	"log"

	"crowd-flow-optimiser/backend/internal/models"
)

// NegotiationOffer is a peer-to-peer proposal from a congested node to a
// neighbour: "I am overflowing by N people, can you absorb a reroute?"
type NegotiationOffer struct {
	From        string
	To          string
	Overflow    int
	RerouteRate float64 // people / min the receiving zone should expect
	Reply       chan NegotiationResponse
}

// NegotiationResponse is the receiving node's verdict.
type NegotiationResponse struct {
	Accepted bool
	Message  string
}

// Node is a single autonomous zone agent. It owns exactly one zone, runs in
// its own goroutine, and reaches consensus with neighbours via channels —
// never through a central simulation loop.
type Node struct {
	ZoneID      string
	Neighbors   []string
	Inbox       chan models.ZoneMetric
	Negotiation chan NegotiationOffer
	state       stateRef
	net         *Network
	intervene   func(models.Intervention)
	last        models.ZoneMetric
}

type stateRef interface {
	Set(models.ZoneMetric)
	Get(string) (models.ZoneMetric, bool)
}

// Run is the node's event loop. It consumes two channel families:
//   - Inbox: fresh telemetry from the ingest path -> local decision.
//   - Negotiation: peer offers -> accept/reject based on spare capacity.
func (n *Node) Run(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			log.Printf("[agent/%s] shutting down", n.ZoneID)
			return
		case m := <-n.Inbox:
			n.evaluate(ctx, m)
		case offer := <-n.Negotiation:
			n.onNegotiation(offer)
		}
	}
}

// evaluate is the local decision engine. It classifies congestion and, for
// CRITICAL zones, negotiates load-shedding with the least-loaded neighbour.
func (n *Node) evaluate(ctx context.Context, m models.ZoneMetric) {
	n.last = m
	switch m.Congestion {
	case models.CongestionCritical:
		overflow := m.Occupancy - m.Capacity
		if overflow > 0 {
			n.shedLoad(ctx, m, overflow)
		}
	case models.CongestionHigh:
		// Soft pressure: a single high zone is a warning, not yet a problem.
		log.Printf("[agent/%s] HIGH density %.2f/m2 (occ %d/%d)", m.ZoneID, m.Density, m.Occupancy, m.Capacity)
	}
}

// shedLoad finds the least-loaded neighbour and offers it the overflow.
// This is the load-balancing handshake that bypasses any central bottleneck.
func (n *Node) shedLoad(ctx context.Context, m models.ZoneMetric, overflow int) {
	target := n.leastLoadedNeighbor()
	if target == "" {
		n.intervene(models.Intervention{
			ZoneID:   n.ZoneID,
			Type:     models.InterventionDispatchStaff,
			Message:  fmt.Sprintf("%s CRITICAL with no absorb capacity in neighbours; dispatch staff", n.ZoneID),
			Severity: models.CongestionCritical,
		})
		return
	}
	offer := NegotiationOffer{
		From:        n.ZoneID,
		To:          target,
		Overflow:    overflow,
		RerouteRate: float64(overflow) * 1.5, // crude flow shaping factor
		Reply:       make(chan NegotiationResponse, 1),
	}
	resp := n.net.Negotiate(ctx, offer)
	if resp.Accepted {
		n.intervene(models.Intervention{
			ZoneID:     n.ZoneID,
			Type:       models.InterventionSignageReroute,
			TargetZone: target,
			Message:    fmt.Sprintf("%s rerouted overflow (%d ppl) to %s :: %s", n.ZoneID, overflow, target, resp.Message),
			Severity:   models.CongestionHigh,
		})
		return
	}
	n.intervene(models.Intervention{
		ZoneID:   n.ZoneID,
		Type:     models.InterventionHoldInflow,
		Message:  fmt.Sprintf("%s hold inflow; reroute rejected by %s :: %s", n.ZoneID, target, resp.Message),
		Severity: models.CongestionHigh,
	})
}

// leastLoadedNeighbor returns the neighbour with the lowest congestion
// level, falling back to lowest density. Empty string if no neighbours.
func (n *Node) leastLoadedNeighbor() string {
	var best string
	bestRank := 99
	bestDensity := 1e9
	for _, id := range n.Neighbors {
		m, ok := n.state.Get(id)
		if !ok {
			continue
		}
		rank := congestionRank(m.Congestion)
		if rank < bestRank || (rank == bestRank && m.Density < bestDensity) {
			best, bestRank, bestDensity = id, rank, m.Density
		}
	}
	return best
}

// onNegotiation accepts an incoming offer if we have genuine spare capacity
// and are not ourselves critical, then applies a physical signage change.
func (n *Node) onNegotiation(offer NegotiationOffer) {
	spare := n.last.Capacity - n.last.Occupancy
	accept := spare >= offer.Overflow && n.last.Congestion != models.CongestionCritical
	var msg string
	if accept {
		msg = fmt.Sprintf("%s absorbing %d ppl from %s (spare=%d)", n.ZoneID, offer.Overflow, offer.From, spare)
		n.intervene(models.Intervention{
			ZoneID:     n.ZoneID,
			Type:       models.InterventionSignageReroute,
			TargetZone: offer.From,
			Message:    msg,
			Severity:   models.CongestionModerate,
		})
	} else {
		msg = fmt.Sprintf("%s rejected reroute from %s (spare=%d, congestion=%s)", n.ZoneID, offer.From, spare, n.last.Congestion)
	}
	select {
	case offer.Reply <- NegotiationResponse{Accepted: accept, Message: msg}:
	default:
	}
}

func congestionRank(l models.CongestionLevel) int {
	switch l {
	case models.CongestionLow:
		return 0
	case models.CongestionModerate:
		return 1
	case models.CongestionHigh:
		return 2
	case models.CongestionCritical:
		return 3
	}
	return 99
}
