"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import TopBar from "@/components/TopBar";
import ZoneCard from "@/components/ZoneCard";
import InterventionLog from "@/components/InterventionLog";
import { applyIntervention, fetchInterventions, fetchZones, streamZones } from "@/lib/api";
import type { Intervention, ZoneMetric } from "@/lib/types";

const ZONE_ORDER = [
  "CONCOURSE_A",
  "BAG_CHECK",
  "E_PIER",
  "GATE_A",
  "GATE_B",
  "PLATFORM_1",
  "PLATFORM_2",
  "SECURITY_T1",
  "SECURITY_T2",
];

export default function Home() {
  const [zones, setZones] = useState<Record<string, ZoneMetric>>({});
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let closeStream: (() => void) | undefined;

    fetchZones()
      .then((zs) => {
        if (!cancelled) {
          setZones(Object.fromEntries(zs.map((z) => [z.zone_id, z])));
        }
      })
      .catch(() => setConnected(false));

    fetchInterventions()
      .then((ivs) => {
        if (!cancelled) setInterventions(ivs);
      })
      .catch(() => undefined);

    closeStream = streamZones({
      onMetric: (m) => setZones((prev) => ({ ...prev, [m.zone_id]: m })),
      onSnapshot: (m) => setZones((prev) => ({ ...prev, [m.zone_id]: m })),
      onError: () => {
        if (!cancelled) setConnected(false);
      },
    });
    setConnected(true);

    return () => {
      cancelled = true;
      closeStream?.();
    };
  }, []);

  const flash = useCallback((msg: string) => {
    setBanner(msg);
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 4000);
  }, []);

  const handleOverride = useCallback(
    async (zoneId: string) => {
      setBusy(true);
      try {
        const iv = await applyIntervention({
          zone_id: zoneId,
          type: "SIGNAGE_REROUTE",
          message: "MANUAL OVERRIDE: operator forced signage reroute",
        });
        setInterventions((prev) => [iv, ...prev]);
        flash(`MANUAL REROUTE EXECUTED -> ${zoneId}`);
      } catch (err) {
        flash(`EXECUTION FAILED: ${String(err)}`);
      } finally {
        setBusy(false);
      }
    },
    [flash],
  );

  const zoneList = useMemo(
    () => ZONE_ORDER.map((id) => zones[id]).filter(Boolean),
    [zones],
  );

  return (
    <main className="min-h-screen">
      <TopBar
        zones={zoneList}
        connected={connected}
        interventionCount={interventions.length}
      />

      {banner && (
        <div className="mx-auto mt-3 max-w-7xl px-4">
          <div className="border border-term-amber/50 bg-term-amber/10 px-3 py-2 text-[11px] tracking-widest text-term-amber">
            {banner}
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-7xl gap-4 px-4 py-4 lg:grid-cols-[1fr_320px]">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[11px] font-bold tracking-widest text-term-dim">
              ZONE AGENT NETWORK
            </h2>
            <span className="text-[10px] text-term-dim">
              goroutine per zone · peer-to-peer negotiation
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {zoneList.map((z) => (
              <ZoneCard
                key={z.zone_id}
                zone={z}
                onOverride={handleOverride}
                busy={busy}
              />
            ))}
          </div>
        </section>

        <aside className="h-[calc(100vh-140px)] min-h-[400px]">
          <InterventionLog log={interventions} />
        </aside>
      </div>
    </main>
  );
}
