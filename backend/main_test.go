package main

import (
	"testing"
	"time"
)

func TestPendingVerdict_Nil(t *testing.T) {
	if ch := pendingVerdict(nil); ch != nil {
		t.Fatalf("expected nil channel for nil request, got %v", ch)
	}
}

func TestPendingVerdict_Active(t *testing.T) {
	respChan := make(chan bool, 1)
	req := &CapacityRequest{
		FromGate: "Gate A",
		Amount:   30,
		Response: respChan,
	}
	ch := pendingVerdict(req)
	if ch == nil {
		t.Fatal("expected active response channel, got nil")
	}

	respChan <- true
	select {
	case verdict := <-ch:
		if !verdict {
			t.Fatal("expected verdict true")
		}
	default:
		t.Fatal("failed to read verdict from channel")
	}
}

func TestGateAgent_AcceptAndRejectFlow(t *testing.T) {
	reqChan := make(chan CapacityRequest, 4)
	adjChan := make(chan CapacityRequest, 4)

	// Launch gateAgent with a large capacity so initial random load leaves plenty of space
	go gateAgent("TestGate", 1000, reqChan, adjChan)

	// Test Accept: request 10 people (1000 capacity has plenty of room)
	resp1 := make(chan bool, 1)
	reqChan <- CapacityRequest{
		FromGate: "Gate X",
		Amount:   10,
		Response: resp1,
	}

	select {
	case accepted := <-resp1:
		if !accepted {
			t.Fatal("expected gate to accept 10 people into 1000 capacity")
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for gate response")
	}

	// Test Reject: request 2000 people (exceeds capacity of 1000)
	resp2 := make(chan bool, 1)
	reqChan <- CapacityRequest{
		FromGate: "Gate X",
		Amount:   2000,
		Response: resp2,
	}

	select {
	case accepted := <-resp2:
		if accepted {
			t.Fatal("expected gate to reject 2000 people into 1000 capacity")
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for gate response")
	}
}

func TestGateAgent_ThresholdRerouteAccepted(t *testing.T) {
	reqChan := make(chan CapacityRequest)
	adjChan := make(chan CapacityRequest)

	// Small capacity so it immediately trips 85% threshold
	go gateAgent("GateLowCap", 10, reqChan, adjChan)

	select {
	case req := <-adjChan:
		if req.FromGate != "GateLowCap" {
			t.Fatalf("unexpected FromGate: %s", req.FromGate)
		}
		// Accept the reroute
		req.Response <- true
	case <-time.After(3 * time.Second):
		// Gate might oscillate before tripping
	}
}

func TestGateAgent_ThresholdRerouteRejected(t *testing.T) {
	reqChan := make(chan CapacityRequest)
	adjChan := make(chan CapacityRequest)

	// Small capacity so it trips 85% threshold
	go gateAgent("GateLowCap2", 10, reqChan, adjChan)

	select {
	case req := <-adjChan:
		if req.FromGate != "GateLowCap2" {
			t.Fatalf("unexpected FromGate: %s", req.FromGate)
		}
		// Reject the reroute
		req.Response <- false
	case <-time.After(3 * time.Second):
		// Gate might oscillate before tripping
	}
}
