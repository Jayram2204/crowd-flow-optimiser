import type { Intervention, InterventionType, ZoneMetric } from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export async function fetchZones(): Promise<ZoneMetric[]> {
  const res = await fetch(`${API_BASE}/api/v1/zones`, { cache: "no-store" });
  if (!res.ok) throw new Error(`zones fetch failed: HTTP ${res.status}`);
  const data = (await res.json()) as { zones: ZoneMetric[] };
  return data.zones;
}

export async function fetchInterventions(): Promise<Intervention[]> {
  const res = await fetch(`${API_BASE}/api/v1/interventions`, { cache: "no-store" });
  if (!res.ok) throw new Error(`interventions fetch failed: HTTP ${res.status}`);
  const data = (await res.json()) as { interventions: Intervention[] };
  return data.interventions;
}

export async function applyIntervention(payload: {
  zone_id: string;
  type: InterventionType;
  message?: string;
}): Promise<Intervention> {
  const res = await fetch(`${API_BASE}/api/v1/interventions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`intervention apply failed: HTTP ${res.status}`);
  return (await res.json()) as Intervention;
}

interface StreamHandlers {
  onMetric: (m: ZoneMetric) => void;
  onSnapshot: (m: ZoneMetric) => void;
  onError: () => void;
}

export function streamZones(handlers: StreamHandlers): () => void {
  const es = new EventSource(`${API_BASE}/api/v1/stream`);
  es.addEventListener("metric", (e) => {
    try {
      handlers.onMetric(JSON.parse((e as MessageEvent).data) as ZoneMetric);
    } catch {
      /* skip malformed frame */
    }
  });
  es.addEventListener("snapshot", (e) => {
    try {
      handlers.onSnapshot(JSON.parse((e as MessageEvent).data) as ZoneMetric);
    } catch {
      /* skip malformed frame */
    }
  });
  es.onerror = () => handlers.onError();
  return () => es.close();
}
