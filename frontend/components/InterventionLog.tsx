"use client";

import { INTERVENTION_LABEL, SEVERITY_COLOR } from "./congestion";
import type { Congestion, Intervention } from "@/lib/types";

/** Render cap — the log grows every negotiation cascade; keep the DOM bound. */
const MAX_LOG_LINES = 50;

export default function InterventionLog({ log }: { log: Intervention[] }) {
  const visible = log.slice(0, MAX_LOG_LINES);

  return (
    <div className="flex h-full flex-col border border-edge bg-panel">
      <div className="flex items-center justify-between border-b border-edge px-3 py-2">
        <h3 className="text-[11px] font-bold tracking-widest text-slate-300">
          AGENT INTERVENTION LOG
        </h3>
        {log.length > MAX_LOG_LINES && (
          <span className="text-[10px] tabular-nums text-term-dim">
            +{log.length - MAX_LOG_LINES} older
          </span>
        )}
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
        {visible.length === 0 && (
          <div className="p-2 text-[11px] text-term-dim">awaiting physical actions…</div>
        )}
        <ol role="log" aria-live="polite" aria-label="Executed interventions" className="space-y-2">
          {visible.map((iv, i) => (
            <li
              key={iv.id}
              className={`border p-2 ${
                iv.type === "DISPATCH_STAFF"
                  ? "border-dashed border-term-amber/50 bg-panel-2"
                  : "border-edge/60 bg-panel-2"
              } ${i === 0 ? "log-land" : ""}`}
            >
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-term-dim">{iv.zone_id}</span>
                <span
                  className={`tracking-widest ${
                    SEVERITY_COLOR[iv.severity as Congestion] ?? "text-term-dim"
                  }`}
                >
                  [{iv.severity}]
                </span>
              </div>
              <div className="mt-1 text-[11px] leading-snug text-slate-300">
                <span className="text-slate-200">
                  {INTERVENTION_LABEL[iv.type] ?? iv.type}
                </span>
                {iv.target_zone ? (
                  <span className="text-term-dim"> → {iv.target_zone}</span>
                ) : null}
              </div>
              <div className="mt-1 text-[10px] leading-snug text-term-dim">{iv.message}</div>
              <div className="mt-1 flex items-center justify-between text-[10px] tabular-nums text-term-dim">
                <span>{new Date(iv.applied_at).toLocaleTimeString()}</span>
                {iv.type === "DISPATCH_STAFF" && (
                  <span className="tracking-widest text-term-amber">→ awaiting operator</span>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
