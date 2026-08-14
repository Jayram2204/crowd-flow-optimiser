package models

import "time"

// CongestionLevel is the canonical crowd state a zone agent operates on.
type CongestionLevel string

const (
	CongestionLow      CongestionLevel = "LOW"
	CongestionModerate CongestionLevel = "MODERATE"
	CongestionHigh     CongestionLevel = "HIGH"
	CongestionCritical CongestionLevel = "CRITICAL"
)

// ZoneMetric is the fused telemetry payload produced by the AI telemetry
// layer and consumed by a single zone agent node.
type ZoneMetric struct {
	ZoneID      string          `json:"zone_id"`
	Capacity    int             `json:"capacity"`
	Density     float64         `json:"density"` // people / sqm
	Occupancy   int             `json:"occupancy"`
	Congestion  CongestionLevel `json:"congestion"`
	InflowRate  float64         `json:"inflow_rate"`  // people / min
	OutflowRate float64         `json:"outflow_rate"` // people / min
	Timestamp   time.Time       `json:"timestamp"`
	// Offline is set when the zone is disabled by the scenario injector
	// (simulated dead neighbour). The zone keeps emitting telemetry but its
	// agent must reject every inbound negotiation.
	Offline bool `json:"offline,omitempty"`
}

// TelemetryBatch is the bulk ingest payload pushed by the AI telemetry layer.
type TelemetryBatch struct {
	Zones []ZoneMetric `json:"zones"`
}

// InterventionType is the class of physical action executed on the venue.
type InterventionType string

const (
	InterventionSignageReroute InterventionType = "SIGNAGE_REROUTE"
	InterventionHoldInflow     InterventionType = "HOLD_INFLOW"
	InterventionDynamicShuttle InterventionType = "DYNAMIC_SHUTTLE"
	InterventionDispatchStaff  InterventionType = "DISPATCH_STAFF"
)

// Intervention represents a physical, simulated action applied to the venue
// (signage API call, staff dispatch, gate hold).
type Intervention struct {
	ID         string           `json:"id"`
	ZoneID     string           `json:"zone_id"`
	Type       InterventionType `json:"type"`
	Message    string           `json:"message"`
	Severity   CongestionLevel  `json:"severity"`
	TargetZone string           `json:"target_zone,omitempty"`
	AppliedAt  time.Time        `json:"applied_at"`
}

// AdHocIntervention is the payload for manually triggering an intervention.
type AdHocIntervention struct {
	ZoneID string           `json:"zone_id"`
	Type   InterventionType `json:"type"`
	Message string          `json:"message,omitempty"`
}
