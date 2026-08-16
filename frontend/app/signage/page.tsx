"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchInterventions, streamZonesWS } from "@/lib/api";
import type { Intervention } from "@/lib/types";

export default function SignagePage() {
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let closeStream: (() => void) | undefined;

    fetchInterventions()
      .then((ivs) => {
        if (!cancelled) setInterventions(ivs);
      })
      .catch(() => undefined);

    closeStream = streamZonesWS({
      onMetric: () => {
        if (!cancelled) setConnected(true);
      },
      onIntervention: (iv) =>
        setInterventions((prev) => {
          const idx = prev.findIndex((p) => p.id === iv.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = iv;
            return next;
          }
          return [iv, ...prev];
        }),
      onOpen: () => {
        if (cancelled) return;
        fetchInterventions()
          .then((ivs) => {
            if (!cancelled) setInterventions(ivs);
          })
          .catch(() => undefined);
      },
      onError: () => {
        if (!cancelled) setConnected(false);
      },
    });

    return () => {
      cancelled = true;
      closeStream?.();
    };
  }, []);

  const activeMessage = useMemo(() => {
    if (interventions.length === 0) return null;
    const relevant = interventions.find(
      (iv) => iv.severity === "CRITICAL" || iv.severity === "HIGH" || iv.severity === "MODERATE"
    );
    return relevant || null;
  }, [interventions]);

  if (!activeMessage) {
    return (
      <main className="min-h-screen bg-black flex flex-col items-center justify-center text-white">
        <div className="absolute top-4 right-4 flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
          <span className="text-xs uppercase tracking-widest text-neutral-500 font-mono">
            {connected ? "LIVE" : "OFFLINE"}
          </span>
        </div>
        <div className="text-center space-y-4 opacity-50">
          <h1 className="text-6xl font-black tracking-tighter">CROWD FLOW OPTIMISER</h1>
          <p className="text-2xl font-light tracking-widest text-neutral-400">
            SYSTEM NORMAL · NO ACTIVE ALERTS
          </p>
        </div>
      </main>
    );
  }

  const isCritical = activeMessage.severity === "CRITICAL";
  const bgClass = isCritical ? "bg-red-600" : "bg-amber-500";
  const textClass = isCritical ? "text-white" : "text-black";

  return (
    <main className={`min-h-screen ${bgClass} ${textClass} flex flex-col items-center justify-center p-12 transition-colors duration-1000`}>
      <div className="absolute top-4 right-4 flex items-center space-x-2">
        <div className="w-3 h-3 rounded-full bg-black animate-pulse" />
        <span className={`text-xs uppercase tracking-widest font-mono font-bold ${isCritical ? "text-red-900" : "text-amber-900"}`}>
          LIVE BROADCAST
        </span>
      </div>
      
      <div className="w-full max-w-7xl space-y-8 text-center">
        <div className={`inline-block px-6 py-2 border-4 ${isCritical ? "border-white" : "border-black"} text-3xl font-black uppercase tracking-widest mb-8`}>
          {activeMessage.type.replace(/_/g, " ")}
        </div>
        
        <h1 className="text-7xl md:text-9xl font-black uppercase tracking-tighter leading-tight">
          {activeMessage.message}
        </h1>
        
        <div className="mt-16 text-2xl font-bold uppercase tracking-widest opacity-80">
          AFFECTED ZONE: {activeMessage.zone_id.replace(/_/g, " ")}
        </div>
      </div>
    </main>
  );
}
