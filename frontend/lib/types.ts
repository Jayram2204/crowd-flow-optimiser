export type Congestion = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface ZoneMetric {
  zone_id: string;
  capacity: number;
  density: number;
  occupancy: number;
  congestion: Congestion;
  inflow_rate: number;
  outflow_rate: number;
  timestamp: string;
}

export type InterventionType =
  | "SIGNAGE_REROUTE"
  | "HOLD_INFLOW"
  | "DYNAMIC_SHUTTLE"
  | "DISPATCH_STAFF";

export interface Intervention {
  id: string;
  zone_id: string;
  type: InterventionType;
  message: string;
  severity: string;
  target_zone?: string;
  applied_at: string;
}

/** Envelope for live-stream frames (WS sends `{event, data}`; SSE names the event). */
export type WSFrame =
  | { event: "metric"; data: ZoneMetric }
  | { event: "intervention"; data: Intervention }
  | { event: "pong" };
