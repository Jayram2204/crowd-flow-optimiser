"use client";

import { CONGESTION_STYLE, pct } from "./congestion";
import type { ZoneMetric } from "@/lib/types";

interface Props {
  zone: ZoneMetric;
}

/**
 * Compact ranked row for the zone field. Dense single-line units so the
 * nominal field reads as a quiet ranked list, never equal-weight cards.
 * Rows stay in venue-adjacency order (the page renders them in ZONE_ORDER);
 * load is encoded through the led/border emphasis, not by reordering.
 */
export default function ZoneRow({ zone }: Props) {
  const s = CONGESTION_STYLE[zone.congestion] ?? CONGESTION_STYLE.LOW;
  const fill = pct(zone.occupancy, zone.capacity);

  return (
    <div className="grid grid-cols-[8.5rem_5rem_1fr_3rem_6rem_6.5rem] items-center gap-3 border-b border-edge/60 px-3 py-2 text-[11px] tabular-nums last:border-b-0">
      <span className="flex min-w-0 items-center gap-2">
        <span aria-hidden="true" className={`led shrink-0 ${s.dot}`} />
        <span className={`truncate tracking-wide ${s.attention ? s.text : "text-slate-200"}`}>
          {zone.zone_id}
        </span>
      </span>

      <span className="text-right text-slate-300">
        {zone.occupancy}
        <span className="text-term-dim">/{zone.capacity}</span>
      </span>

      <span className="block h-0.5 w-full overflow-hidden bg-void">
        <span className={`block h-full ${s.bar}`} style={{ width: `${fill}%` }} />
      </span>

      <span className={`text-right ${s.attention ? s.text : "text-slate-100"}`}>{fill}%</span>

      <span className={`text-right text-[10px] tracking-widest ${s.text}`}>{zone.congestion}</span>

      <span className="text-right text-term-dim">
        +{zone.inflow_rate.toFixed(0)}/−{zone.outflow_rate.toFixed(0)}
      </span>
    </div>
  );
}
