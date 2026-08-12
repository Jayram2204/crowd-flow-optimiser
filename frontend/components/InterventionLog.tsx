"use client";

import type { Intervention } from "@/lib/types";

const SEVERITY_COLOR: Record<string, string> = {
  CRITICAL: "text-term-red",
  HIGH: "text-orange-500",
  MODERATE: "text-term-amber",
  LOW: "text-terminal",
};

export default function InterventionLog({ log }: { log: Intervention[] }) {
  return (
    <div className="border border-edge bg-panel h-full flex flex-col">
      <div className="border-b border-edge px-3 py-2 text-[11px] font-bold tracking-widest text-slate-300">
        INTERVENTION LOG <span className="text-term-dim">// signage-api</span>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
        {log.length === 0 && (
          <div className="p-2 text-[11px] text-term-dim">// awaiting physical actions...</div>
        )}
        {log.map((iv) => (
          <div
            key={iv.id}
            className="mb-2 border border-edge/60 bg-panel-2 p-2"
          >
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-term-dim">{iv.zone_id}</span>
              <span className={`tracking-widest ${SEVERITY_COLOR[iv.severity] ?? "text-term-dim"}`}>
                [{iv.severity}]
              </span>
            </div>
            <div className="mt-1 text-[11px] text-slate-300 leading-snug">
              <span className="text-term-amber">{iv.type}</span>
              {iv.target_zone ? (
                <span className="text-term-dim"> → {iv.target_zone}</span>
              ) : null}
            </div>
            <div className="mt-1 text-[10px] text-term-dim leading-snug">{iv.message}</div>
            <div className="mt-1 text-[9px] text-term-dim tabular-nums">
              {new Date(iv.applied_at).toLocaleTimeString()}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
