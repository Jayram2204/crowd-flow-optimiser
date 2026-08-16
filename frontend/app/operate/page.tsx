"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import TopBar from "@/components/TopBar";
import ZoneLead from "@/components/ZoneLead";
import ZoneRow from "@/components/ZoneRow";
import InterventionLog from "@/components/InterventionLog";
import DemoControls from "@/components/DemoControls";
import { applyIntervention, fetchInterventions, fetchZones, streamZonesWS } from "@/lib/api";
import { SEVERITY_RANK } from "@/components/congestion";
import type { Intervention, ZoneMetric } from "@/lib/types";

/**
 * Venue-adjacency order (the backend's topology chain). Zones render in this
 * order so physically adjacent zones sit near each other; load is encoded
 * through emphasis, not by reordering the field.
 */
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

export default function Operate() {
  const [zones, setZones] = useState<Record<string, ZoneMetric>>({});
  const [zoneOverrides, setZoneOverrides] = useState<Record<string, Partial<ZoneMetric>>>({});
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [bannerTone, setBannerTone] = useState<"ok" | "error">("ok");
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

    closeStream = streamZonesWS({
      // LIVE only when data is actually flowing — a socket being open proves
      // nothing until a frame lands.
      onMetric: (m) => {
        if (!cancelled) setConnected(true);
        setZones((prev) => ({ ...prev, [m.zone_id]: m }));
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
        // Refetch the authoritative list on every (re)connect so the log
        // never misses interventions that executed while the stream was down.
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

  const flash = useCallback((msg: string, tone: "ok" | "error" = "ok") => {
    setBanner(msg);
    setBannerTone(tone);
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
        flash(`EXECUTION FAILED: ${String(err)}`, "error");
      } finally {
        setBusy(false);
      }
    },
    [flash],
  );

  const handleInjectBottleneck = useCallback(() => {
    setZoneOverrides((prev) => ({
      ...prev,
      GATE_A: { density: 1.45, congestion: "CRITICAL" },
    }));
    setInterventions((prev) => [
      {
        id: `demo-iv-${Date.now()}`,
        zone_id: "GATE_A",
        type: "SIGNAGE_REROUTE",
        message: "AUTO-NEGOTIATION: Redirecting 40% flow to Corridors B & C",
        severity: "CRITICAL",
        applied_at: new Date().toISOString(),
      },
      ...prev,
    ]);
    flash("DEMO OVERRIDE: GATE_A BOTTLENECK INJECTED", "error");
  }, [flash]);

  const handleInjectEmergencyBlock = useCallback(() => {
    setZoneOverrides((prev) => ({
      ...prev,
      E_PIER: { density: 2.1, congestion: "CRITICAL" },
    }));
    setInterventions((prev) => [
      {
        id: `demo-iv-${Date.now()}`,
        zone_id: "E_PIER",
        type: "HOLD_INFLOW",
        message: "SYSTEM OVERRIDE: Emergency exit block detected. Halting inbound flow.",
        severity: "CRITICAL",
        applied_at: new Date().toISOString(),
      },
      ...prev,
    ]);
    flash("DEMO OVERRIDE: EMERGENCY EXIT BLOCKED", "error");
  }, [flash]);

  const handleResetFlow = useCallback(() => {
    setZoneOverrides({});
    flash("DEMO OVERRIDE: NORMAL FLOW RESTORED");
  }, [flash]);

  const effectiveZones = useMemo(() => {
    const res: Record<string, ZoneMetric> = {};
    for (const [id, z] of Object.entries(zones)) {
      res[id] = { ...z, ...zoneOverrides[id] };
    }
    return res;
  }, [zones, zoneOverrides]);

  /** Lead = highest severity, tie-broken by density. Null until data lands. */
  const lead = useMemo(() => {
    const list = Object.values(effectiveZones);
    if (list.length === 0) return null;
    return list.reduce((a, b) => {
      const ra = SEVERITY_RANK[a.congestion] ?? 0;
      const rb = SEVERITY_RANK[b.congestion] ?? 0;
      if (rb !== ra) return rb > ra ? b : a;
      return b.density > a.density ? b : a;
    });
  }, [effectiveZones]);

  /**
   * The lead zone's most recent action. Newest-first list; the first match
   * for the lead zone is its latest intervention — autonomous or manual.
   * This is the "is the system already acting?" answer pinned to the lead.
   */
  const leadAction = useMemo(
    () => (lead ? interventions.find((iv) => iv.zone_id === lead.zone_id) ?? null : null),
    [interventions, lead],
  );

  /** Field = remaining zones in venue-adjacency order. */
  const rows = useMemo(
    () =>
      ZONE_ORDER.map((id) => effectiveZones[id]).filter(
        (z): z is ZoneMetric => Boolean(z) && z.zone_id !== lead?.zone_id,
      ),
    [effectiveZones, lead],
  );

  const zoneList = useMemo(
    () => ZONE_ORDER.map((id) => effectiveZones[id]).filter((z): z is ZoneMetric => Boolean(z)),
    [effectiveZones],
  );

  return (
    <main className="min-h-screen">
      <TopBar
        zones={zoneList}
        connected={connected}
        interventionCount={interventions.length}
      />

      {banner && (
        <div className="mx-auto mt-3 max-w-[90rem] px-4">
          <div
            role="status"
            className={`border px-3 py-2 text-[11px] tracking-widest ${
              bannerTone === "error"
                ? "border-term-red/50 bg-term-red/10 text-term-red"
                : "border-terminal/40 bg-terminal/10 text-terminal"
            }`}
          >
            {banner}
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-[90rem] grid-cols-1 gap-6 px-4 py-6 lg:grid-cols-[18rem_minmax(0,1fr)_22rem]">
        {/* DEMO CONTROLS DRAWER (Left) */}
        <aside className="order-2 lg:order-1 lg:col-start-1 lg:row-start-1 lg:row-span-2">
          <DemoControls
            onInjectBottleneck={handleInjectBottleneck}
            onInjectEmergencyBlock={handleInjectEmergencyBlock}
            onResetFlow={handleResetFlow}
          />
        </aside>

        {/* LEAD ZONE (Center) */}
        <div className="order-1 lg:order-2 lg:col-start-2 lg:row-start-1">
          {lead ? (
            <ZoneLead zone={lead} autoAction={leadAction} onOverride={handleOverride} busy={busy} />
          ) : (
            <div className="border border-edge bg-panel p-4 text-[11px] text-term-dim">
              awaiting telemetry…
            </div>
          )}
        </div>

        {/* INTERVENTION LOG (Right) */}
        <aside className="order-3 lg:col-start-3 lg:row-start-1 lg:row-span-2 h-[24rem] lg:h-auto lg:max-h-[calc(100vh-5rem)]">
          <InterventionLog log={interventions} />
        </aside>

        {/* ZONE FIELD (Center Bottom) */}
        <section className="order-4 lg:col-start-2 lg:row-start-2">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[11px] font-bold tracking-widest text-term-dim">
              ZONE FIELD
            </h2>
            <span className="text-[10px] text-term-dim">
              venue adjacency · load ranked
            </span>
          </div>
          <div className="border border-edge bg-panel">
            {rows.map((z) => (
              <ZoneRow key={z.zone_id} zone={z} />
            ))}
            {rows.length === 0 && (
              <div className="p-3 text-[11px] text-term-dim">
                all zones in the lead — field collapsed
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
