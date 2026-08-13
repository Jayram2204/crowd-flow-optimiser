"use client";

import type { Congestion, InterventionType } from "@/lib/types";

/** Sentence-case label for an intervention type (brand: monospace, sentence case). */
export const INTERVENTION_LABEL: Record<InterventionType, string> = {
  SIGNAGE_REROUTE: "signage reroute",
  HOLD_INFLOW: "hold inflow",
  DYNAMIC_SHUTTLE: "dynamic shuttle",
  DISPATCH_STAFF: "staff dispatch",
};

/** Single severity color map — the log and the field both read from here. */
export const SEVERITY_COLOR: Record<Congestion, string> = {
  CRITICAL: "text-term-red",
  HIGH: "text-term-amber",
  MODERATE: "text-term-dim",
  LOW: "text-terminal",
};

export const SEVERITY_RANK: Record<Congestion, number> = {
  LOW: 0,
  MODERATE: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export interface CongestionStyle {
  /** label / value color */
  text: string;
  /** load-bar fill */
  bar: string;
  /** status led */
  dot: string;
  /** hairline border for attention states (nominal stays on edge) */
  border: string;
  /** true when the zone needs attention right now */
  attention: boolean;
}

/**
 * Nominal (LOW/MODERATE) stays near-monochrome; the accent is reserved for
 * the zone(s) that need attention (HIGH amber, CRITICAL red). Congestion is
 * never color-only: the level label always renders alongside.
 */
export const CONGESTION_STYLE: Record<Congestion, CongestionStyle> = {
  LOW: {
    text: "text-slate-400",
    bar: "bg-slate-500",
    dot: "bg-slate-500 text-slate-500",
    border: "border-edge",
    attention: false,
  },
  MODERATE: {
    text: "text-slate-300",
    bar: "bg-slate-400",
    dot: "bg-slate-400 text-slate-400",
    border: "border-edge",
    attention: false,
  },
  HIGH: {
    text: "text-term-amber",
    bar: "bg-term-amber",
    dot: "bg-term-amber text-term-amber",
    border: "border-term-amber/40",
    attention: true,
  },
  CRITICAL: {
    text: "text-term-red",
    bar: "bg-term-red",
    dot: "bg-term-red text-term-red",
    border: "border-term-red/60",
    attention: true,
  },
};

export function pct(occupancy: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.min(100, Math.round((occupancy / capacity) * 100));
}
