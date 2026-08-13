"use client";

import { useEffect, useRef, useState } from "react";

import { CONGESTION_STYLE, INTERVENTION_LABEL, pct } from "./congestion";
import type { Intervention, ZoneMetric } from "@/lib/types";

interface Props {
  zone: ZoneMetric;
  /** The lead zone's latest executed action (autonomous or manual), if any. */
  autoAction: Intervention | null;
  onOverride: (zoneId: string) => void;
  busy: boolean;
}

/** Seconds since a timestamp, floor 1s. Refreshes on each 2s telemetry frame. */
function ageAgo(iso: string): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return `${s}s ago`;
}

/**
 * Lead block: the zone that needs attention right now. The oversized
 * tabular load numeral is the first thing an operator reads. When the top
 * zone is nominal the block stays monochrome and quiet; the accent is
 * reserved for attention states so the moment a zone trips HIGH/CRITICAL
 * the number's color change is unmistakable without layout shift.
 *
 * The action line answers the operator's only question — "is the system
 * already acting?" — by pinning the lead zone's latest intervention here.
 * FORCE REROUTE is a physical signage intervention, so it is armed in two
 * steps: press once to arm (CONFIRM REROUTE?), press again to execute.
 */
export default function ZoneLead({ zone, autoAction, onOverride, busy }: Props) {
  const s = CONGESTION_STYLE[zone.congestion] ?? CONGESTION_STYLE.LOW;
  const fill = pct(zone.occupancy, zone.capacity);

  const [armed, setArmed] = useState(false);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Disarm if the lead changes or the operator leaves the surface.
  useEffect(() => {
    setArmed(false);
    return () => {
      if (armTimer.current) clearTimeout(armTimer.current);
    };
  }, [zone.zone_id]);

  const handleClick = () => {
    if (busy) return;
    if (armed) {
      if (armTimer.current) clearTimeout(armTimer.current);
      setArmed(false);
      onOverride(zone.zone_id);
    } else {
      setArmed(true);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(false), 4000);
    }
  };

  const actionLabel = autoAction ? (INTERVENTION_LABEL[autoAction.type] ?? autoAction.type) : "";
  const manualAction = autoAction?.message.startsWith("MANUAL OVERRIDE") ?? false;

  return (
    <section className={`flex flex-col gap-4 border bg-panel p-4 ${s.border}`}>
      <div className="flex items-center justify-between border-b border-edge pb-3">
        <h2
          id={`${zone.zone_id}-lead-title`}
          className="text-[11px] font-bold tracking-widest text-slate-200"
        >
          {zone.zone_id}
        </h2>
        <span className={`flex items-center gap-2 text-[11px] tracking-widest ${s.text}`}>
          <span className={`led ${s.dot}`} aria-hidden="true" />
          {zone.congestion}
        </span>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div
          key={autoAction?.id ?? "none"}
          aria-labelledby={`${zone.zone_id}-lead-title`}
          className={`numeral-beat text-7xl leading-none tabular-nums ${s.attention ? s.text : "text-slate-100"}`}
        >
          {fill}
          <span className="ml-1 text-2xl text-term-dim">%</span>
        </div>
        <div className="flex flex-col items-end gap-1 pb-1 text-[11px] tabular-nums">
          <span className="text-slate-100">
            {zone.occupancy}
            <span className="text-term-dim"> / {zone.capacity}</span>
          </span>
          <span className="text-term-dim">density {zone.density.toFixed(2)} ppl/m²</span>
          <span className="text-term-dim">
            IN +{zone.inflow_rate.toFixed(1)}/m · OUT −{zone.outflow_rate.toFixed(1)}/m
          </span>
        </div>
      </div>

      <div className="h-1 w-full overflow-hidden bg-void">
        <div className={`h-full ${s.bar}`} style={{ width: `${fill}%` }} />
      </div>

      {autoAction && (
        <div className="flex items-center justify-between border-t border-edge/60 pt-3 text-[11px] tabular-nums">
          <span>
            <span className={s.text}>{manualAction ? "OP OVERRIDE" : "AUTO"}</span>
            <span className="text-term-dim"> → </span>
            <span className="text-slate-200">{actionLabel}</span>
          </span>
          <span className="text-term-dim">{ageAgo(autoAction.applied_at)}</span>
        </div>
      )}

      <button
        onClick={handleClick}
        disabled={busy}
        aria-pressed={armed}
        title={
          armed
            ? "Press again to execute the signage reroute"
            : "Press once to arm, then press again to execute"
        }
        className={`mt-1 self-start border px-4 text-[11px] tracking-widest transition-colors min-h-[44px] disabled:opacity-40 ${
          armed
            ? "border-term-red bg-term-red/10 text-term-red hover:bg-term-red/20"
            : "border-edge text-term-amber hover:border-term-amber/60 hover:bg-term-amber/10"
        }`}
      >
        {armed ? "▸ CONFIRM REROUTE?" : "▸ FORCE REROUTE"}
      </button>
    </section>
  );
}
