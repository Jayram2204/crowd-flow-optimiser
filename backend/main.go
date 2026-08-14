// Standalone minimal agent engine: Gate A and Gate B negotiate directly
// through channels when either hits critical mass. Run with `go run .`
// from backend/. This is the raw negotiation primitive the full network in
// cmd/server generalises to N zones.
package main

import (
	"fmt"
	"math/rand"
	"time"
)

type CapacityRequest struct {
	FromGate string
	Amount   int
	Response chan bool
}

func gateAgent(name string, maxCapacity int, reqChan chan CapacityRequest, adjacentGate chan CapacityRequest) {
	// Start in the mid-range so negotiation windows open on a demo timescale
	// (a gate starting empty drifts below threshold for minutes).
	currentLoad := rand.Intn(maxCapacity/2) + maxCapacity/4

	// pending tracks an outstanding negotiation. While waiting for a verdict
	// this gate keeps serving inbound requests, so two gates that trip
	// critical simultaneously can never deadlock on each other's channels.
	var pending *CapacityRequest

	for {
		// Simulate incoming telemetry from the AI Python layer. Slight net
		// inflow with enough outflow that load oscillates: Gate A trips 85%
		// first while Gate B still has headroom, so the ACCEPT path demos;
		// later both saturate and the REJECT path demos.
		currentLoad += rand.Intn(10) - rand.Intn(5)
		currentLoad = max(0, currentLoad)
		fmt.Printf("[%s] Current Load: %d/%d\n", name, currentLoad, maxCapacity)

		// Threshold trigger: 85% capacity
		if pending == nil && currentLoad > int(float64(maxCapacity)*0.85) {
			fmt.Printf("⚠️ WARNING: [%s] Critical density reached. Initiating reroute protocol...\n", name)

			// Ask adjacent gate if it has capacity. Non-blocking send: if the
			// peer is mid-negotiation we escalate instead of deadlocking.
			respChan := make(chan bool)
			select {
			case adjacentGate <- CapacityRequest{FromGate: name, Amount: 50, Response: respChan}:
				pending = &CapacityRequest{FromGate: name, Amount: 50, Response: respChan}
			default:
				fmt.Printf("🚨 ALERT: Adjacent gate busy negotiating. Reroute failed. Escalating to human intervention.\n")
			}
		}

		// Event loop: serve inbound requests, await our negotiation verdict,
		// or tick. Being in this select is exactly why the send above lands:
		// the peer is (almost) always receiving, so requests are never dropped.
		select {
		case req := <-reqChan:
			if currentLoad+req.Amount < maxCapacity {
				fmt.Printf("[%s] Accepting %d rerouted people from %s.\n", name, req.Amount, req.FromGate)
				currentLoad += req.Amount
				req.Response <- true
			} else {
				fmt.Printf("🚨 ALERT: [%s] Adjacent gate full. Reroute from %s rejected.\n", name, req.FromGate)
				req.Response <- false
			}
		case verdict := <-pendingVerdict(pending):
			if verdict {
				fmt.Printf("✅ SUCCESS: [%s] Traffic successfully rerouted to adjacent gate. Triggering Signage API.\n", name)
				currentLoad -= 50
			} else {
				fmt.Printf("🚨 ALERT: Adjacent gate full. Reroute failed. Escalating to human intervention.\n")
			}
			pending = nil
		case <-time.After(2 * time.Second): // Tick rate
		}
	}
}

// pendingVerdict returns the response channel of an outstanding negotiation,
// or nil when idle. A nil channel disables that select case.
func pendingVerdict(p *CapacityRequest) <-chan bool {
	if p == nil {
		return nil
	}
	return p.Response
}

func main() {
	gateAChan := make(chan CapacityRequest)
	gateBChan := make(chan CapacityRequest)

	// Fire up the agents in parallel
	go gateAgent("Gate A (North)", 100, gateAChan, gateBChan)
	go gateAgent("Gate B (South)", 150, gateBChan, gateAChan)

	// Keep main alive
	select {}
}
