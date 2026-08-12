"use client";

import type { ZoneMetric } from "@/lib/types";

interface Props {
  zones: ZoneMetric[];
  connected: boolean;
  interventionCount: number;
}

export default function TopBar({ zones, connected, interventionCount }: Props) {
  const online = zones.length;
  const occupancy = zones.reduce((acc, z) => acc + z.occupancy, 0);
  const capacity = zones.reduce((acc, z) => acc + z.capacity, 0);
  const critical = zones.filter((z) => z.congestion === "CRITICAL").length;
  const high = zones.filter((z) => z.congestion === "HIGH").length;

  return (
    <header className="grid-overlay border-b border-edge bg-panel/80 backdrop-blur sticky top-0 z-40">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-bold tracking-[0.25em] text-slate-100">
            CROWD<span className="text-terminal">_FLOW</span>
            <span className="text-term-dim">//</span>
            OPTIMISER
          </h1>
          <span className="hidden text-[10px] tracking-widest text-term-dim sm:inline">
            DECENTRALIZED ZONE-AGENT NETWORK
          </span>
        </div>

        <div className="flex items-center gap-4 text-[11px] tabular-nums">
          <span className="flex items-center gap-1.5">
            <span className={`led ${connected ? "bg-terminal text-terminal" : "bg-term-red text-term-red"}`} />
            <span className={connected ? "text-terminal" : "text-term-red"}>
              {connected ? "STREAM::LIVE" : "STREAM::LOST"}
            </span>
          </span>
          <Stat label="ZONES" value={`${online}`} accent="text-slate-200" />
          <Stat label="OCCUPANCY" value={`${occupancy}/${capacity}`} accent="text-slate-200" />
          <Stat label="HIGH" value={`${high}`} accent={high > 0 ? "text-term-amber" : "text-term-dim"} />
          <Stat label="CRITICAL" value={`${critical}`} accent={critical > 0 ? "text-term-red" : "text-term-dim"} />
          <Stat label="INTERVENTIONS" value={`${interventionCount}`} accent="text-term-amber" />
        </div>
      </div>
    </header>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <span className="flex flex-col items-end leading-tight">
      <span className={`text-[10px] tracking-widest text-term-dim`}>{label}</span>
      <span className={`text-sm font-bold ${accent}`}>{value}</span>
    </span>
  );
}
