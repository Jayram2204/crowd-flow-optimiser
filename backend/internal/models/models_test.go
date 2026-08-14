package models

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestZoneMetric_JSONRoundTrip(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Second)
	m := ZoneMetric{
		ZoneID:      "GATE_A",
		Capacity:    120,
		Density:     0.94,
		Occupancy:   115,
		Congestion:  CongestionCritical,
		InflowRate:  41.5,
		OutflowRate: 3.2,
		Timestamp:   now,
		Offline:     false,
	}

	bytes, err := json.Marshal(m)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}

	// Offline false should be omitted by omitempty
	if strings.Contains(string(bytes), `"offline"`) {
		t.Fatalf("expected offline to be omitted when false, got: %s", string(bytes))
	}

	var parsed ZoneMetric
	if err := json.Unmarshal(bytes, &parsed); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if parsed.ZoneID != m.ZoneID || parsed.Capacity != m.Capacity || parsed.Congestion != m.Congestion ||
		parsed.Density != m.Density || parsed.Occupancy != m.Occupancy || parsed.InflowRate != m.InflowRate ||
		parsed.OutflowRate != m.OutflowRate || !parsed.Timestamp.Equal(m.Timestamp) || parsed.Offline != m.Offline {
		t.Fatalf("parsed metric mismatch: %+v vs %+v", parsed, m)
	}

	// Test with Offline: true
	m.Offline = true
	bytes, err = json.Marshal(m)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	if !strings.Contains(string(bytes), `"offline":true`) {
		t.Fatalf("expected offline:true in json, got: %s", string(bytes))
	}
	var parsedOffline ZoneMetric
	if err := json.Unmarshal(bytes, &parsedOffline); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if !parsedOffline.Offline {
		t.Fatalf("expected parsedOffline.Offline to be true")
	}
}

func TestTelemetryBatch_JSON(t *testing.T) {
	raw := `{"zones":[{"zone_id":"A","capacity":100,"occupancy":80,"congestion":"HIGH"}]}`
	var batch TelemetryBatch
	if err := json.Unmarshal([]byte(raw), &batch); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}
	if len(batch.Zones) != 1 || batch.Zones[0].ZoneID != "A" || batch.Zones[0].Capacity != 100 ||
		batch.Zones[0].Occupancy != 80 || batch.Zones[0].Congestion != CongestionHigh {
		t.Fatalf("unexpected batch content: %+v", batch)
	}

	marshaled, err := json.Marshal(batch)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	if !strings.Contains(string(marshaled), `"zones"`) {
		t.Fatalf("expected zones in marshaled batch: %s", string(marshaled))
	}
}

func TestIntervention_JSONRoundTrip(t *testing.T) {
	now := time.Now().UTC().Truncate(time.Second)
	iv := Intervention{
		ID:         "iv-123",
		ZoneID:     "GATE_A",
		Type:       InterventionSignageReroute,
		Message:    "Reroute to GATE_B",
		Severity:   CongestionHigh,
		TargetZone: "GATE_B",
		AppliedAt:  now,
	}

	data, err := json.Marshal(iv)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	if !strings.Contains(string(data), `"target_zone":"GATE_B"`) {
		t.Fatalf("expected target_zone in json: %s", string(data))
	}

	var parsed Intervention
	if err := json.Unmarshal(data, &parsed); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if parsed.ID != iv.ID || parsed.ZoneID != iv.ZoneID || parsed.Type != iv.Type ||
		parsed.Message != iv.Message || parsed.Severity != iv.Severity ||
		parsed.TargetZone != iv.TargetZone || !parsed.AppliedAt.Equal(iv.AppliedAt) {
		t.Fatalf("parsed intervention mismatch: %+v vs %+v", parsed, iv)
	}

	// Test with empty TargetZone (should be omitted)
	ivNoTarget := Intervention{
		ID:        "iv-456",
		ZoneID:    "GATE_A",
		Type:      InterventionHoldInflow,
		Message:   "Hold inflow",
		Severity:  CongestionCritical,
		AppliedAt: now,
	}
	dataNoTarget, err := json.Marshal(ivNoTarget)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	if strings.Contains(string(dataNoTarget), `"target_zone"`) {
		t.Fatalf("expected target_zone to be omitted when empty, got: %s", string(dataNoTarget))
	}
}

func TestAdHocIntervention_JSON(t *testing.T) {
	raw := `{"zone_id":"GATE_A","type":"HOLD_INFLOW"}`
	var req AdHocIntervention
	if err := json.Unmarshal([]byte(raw), &req); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if req.ZoneID != "GATE_A" || req.Type != InterventionHoldInflow || req.Message != "" {
		t.Fatalf("unexpected adhoc intervention: %+v", req)
	}

	// With message
	reqWithMessage := AdHocIntervention{
		ZoneID:  "GATE_B",
		Type:    InterventionDispatchStaff,
		Message: "Dispatch 2 guards",
	}
	data, err := json.Marshal(reqWithMessage)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	if !strings.Contains(string(data), `"message":"Dispatch 2 guards"`) {
		t.Fatalf("expected message in json: %s", string(data))
	}

	// Without message (omitempty)
	reqNoMessage := AdHocIntervention{
		ZoneID: "GATE_C",
		Type:   InterventionDynamicShuttle,
	}
	dataNoMsg, err := json.Marshal(reqNoMessage)
	if err != nil {
		t.Fatalf("marshal error: %v", err)
	}
	if strings.Contains(string(dataNoMsg), `"message"`) {
		t.Fatalf("expected message to be omitted when empty: %s", string(dataNoMsg))
	}
}

func TestConstants_Integrity(t *testing.T) {
	if CongestionLow != "LOW" || CongestionModerate != "MODERATE" ||
		CongestionHigh != "HIGH" || CongestionCritical != "CRITICAL" {
		t.Fatal("congestion level constants mismatch")
	}
	if InterventionSignageReroute != "SIGNAGE_REROUTE" ||
		InterventionHoldInflow != "HOLD_INFLOW" ||
		InterventionDynamicShuttle != "DYNAMIC_SHUTTLE" ||
		InterventionDispatchStaff != "DISPATCH_STAFF" {
		t.Fatal("intervention type constants mismatch")
	}
}
