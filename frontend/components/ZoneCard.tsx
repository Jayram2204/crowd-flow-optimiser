"use client";

import { CONGESTION_STYLE, pct } from "./congestion";
import type { ZoneMetric } from "@/lib/types";

interface Props {
  zone: ZoneMetric;
  onOverride: (zoneId: string) => void;
  busy: boolean;
}

export default function ZoneCard({ zone, onOverride, busy }: Props) {
  const style = CONGESTION_STYLE[zone.congestion] ?? CONGESTION_STYLE.LOW;
  const fill = pct(zone.occupancy, zone.capacity);
  const critical = zone.congestion === "CRITICAL";

  return (
    <div
      className={`border ${style.border} bg-panel relative flex flex-col gap-2 p-3 transition-colors ${
        critical ? "animate-pulse" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-widest text-slate-300">
          {zone.zone_id}
        </span>
        <span className={`flex items-center gap-1.5 text-[10px] tracking-wider ${style.text}`}>
          <span className={`led ${style.dot}`} />
          {zone.congestion}
        </span>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl leading-none text-slate-100 tabular-nums">
            {zone.occupancy}
            <span className="text-xs text-term-dim"> / {zone.capacity}</span>
          </div>
          <div className="mt-1 text-[10px] text-term-dim tracking-widest">OCCUPANCY</div>
        </div>
        <div className="text-right">
          <div className="text-lg leading-none text-slate-200 tabular-nums">
            {zone.density.toFixed(2)}
          </div>
          <div className="mt-1 text-[10px] text-term-dim tracking-widest">PPL/M²</div>
        </div>
      </div>

      <div className="h-1.5 w-full bg-void overflow-hidden">
        <div className={`h-full ${style.bar}`} style={{ width: `${fill}%` }} />
      </div>

      <div className="flex justify-between text-[10px] text-term-dim tabular-nums">
        <span>IN +{zone.inflow_rate.toFixed(1)}/m</span>
        <span>OUT −{zone.outflow_rate.toFixed(1)}/m</span>
      </div>

      <button
        onClick={() => onOverride(zone.zone_id)}
        disabled={busy}
        className="mt-1 border border-edge px-2 py-1 text-[10px] tracking-widest text-term-amber hover:border-term-amber/60 hover:bg-term-amber/10 disabled:opacity-40"
      >
        ▸ FORCE REROUTE
      </button>
    </div>
  );
}
