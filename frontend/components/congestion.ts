"use client";

import type { Congestion } from "@/lib/types";

export const CONGESTION_STYLE: Record<
  Congestion,
  { text: string; bar: string; border: string; dot: string }
> = {
  LOW: {
    text: "text-terminal",
    bar: "bg-terminal",
    border: "border-terminal/25",
    dot: "bg-terminal text-terminal",
  },
  MODERATE: {
    text: "text-term-amber",
    bar: "bg-term-amber",
    border: "border-term-amber/25",
    dot: "bg-term-amber text-term-amber",
  },
  HIGH: {
    text: "text-orange-500",
    bar: "bg-orange-500",
    border: "border-orange-500/40",
    dot: "bg-orange-500 text-orange-500",
  },
  CRITICAL: {
    text: "text-term-red",
    bar: "bg-term-red",
    border: "border-term-red/60",
    dot: "bg-term-red text-term-red",
  },
};

export function pct(occupancy: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.min(100, Math.round((occupancy / capacity) * 100));
}
