package agent

import (
	"context"
	"log"
	"sync"
	"time"

	"crowd-flow-optimiser/backend/internal/intervention"
	"crowd-flow-optimiser/backend/internal/models"
	"crowd-flow-optimiser/backend/internal/state"
)

// Network is the peer registry and message bus for zone agents. Nodes hold
// zero global simulation state: they talk directly to each other.
type Network struct {
	mu    sync.RWMutex
	nodes map[string]*Node
	order []string
}

// NewNetwork creates an empty agent network.
func NewNetwork() *Network {
	return &Network{nodes: make(map[string]*Node)}
}

// register binds a node into the peer registry.
func (n *Network) register(node *Node) {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.nodes[node.ZoneID] = node
	n.order = append(n.order, node.ZoneID)
}

// Node returns a registered zone agent by ID.
func (n *Network) Node(zoneID string) (*Node, bool) {
	n.mu.RLock()
	defer n.mu.RUnlock()
	node, ok := n.nodes[zoneID]
	return node, ok
}

// Deliver routes a telemetry metric to its owning agent's inbox. Sends are
// non-blocking: if the agent is saturated the sample is dropped rather than
// stalling the ingest path.
func (n *Network) Deliver(m models.ZoneMetric) {
	node, ok := n.Node(m.ZoneID)
	if !ok {
		return
	}
	select {
	case node.Inbox <- m:
	default:
		log.Printf("[net] dropped sample for %s (agent saturated)", m.ZoneID)
	}
}

// Negotiate performs the direct peer-to-peer handshake between two nodes.
func (n *Network) Negotiate(ctx context.Context, offer NegotiationOffer) NegotiationResponse {
	target, ok := n.Node(offer.To)
	if !ok {
		return NegotiationResponse{Accepted: false, Message: "target zone unknown"}
	}
	select {
	case target.Negotiation <- offer:
	case <-ctx.Done():
		return NegotiationResponse{Accepted: false, Message: "negotiation cancelled"}
	}
	select {
	case resp := <-offer.Reply:
		return resp
	case <-time.After(2 * time.Second):
		return NegotiationResponse{Accepted: false, Message: "negotiation timeout"}
	case <-ctx.Done():
		return NegotiationResponse{Accepted: false, Message: "negotiation cancelled"}
	}
}

// BuildNetwork wires up the full zone topology: one autonomous goroutine per
// zone, adjacent zones linked as negotiation peers (ring adjacency derived
// from topology order), all sharing the state manager and signage service.
func BuildNetwork(
	ctx context.Context,
	zoneIDs []string,
	st *state.Manager,
	signage *intervention.Service,
) *Network {
	net := NewNetwork()

	nodes := make([]*Node, 0, len(zoneIDs))
	for _, id := range zoneIDs {
		node := &Node{
			ZoneID:      id,
			Inbox:       make(chan models.ZoneMetric, 64),
			Negotiation: make(chan NegotiationOffer, 8),
			state:       st,
			net:         net,
			intervene:   func(iv models.Intervention) { signage.Apply(iv) },
		}
		net.register(node)
		nodes = append(nodes, node)
	}

	// Ring adjacency: each zone can negotiate with the zones before/after it.
	// In production this comes from a spatial graph builder.
	for i, node := range nodes {
		prev := nodes[(i-1+len(nodes))%len(nodes)]
		next := nodes[(i+1)%len(nodes)]
		node.Neighbors = []string{prev.ZoneID, next.ZoneID}
	}

	for _, node := range nodes {
		go node.Run(ctx)
		log.Printf("[net] zone agent online :: %s <-> %v", node.ZoneID, node.Neighbors)
	}
	return net
}
