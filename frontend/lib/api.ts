import type { Intervention, InterventionType, WSFrame, ZoneMetric } from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
export const API_WS = API_BASE.replace(/^http/, "ws");

export async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

export async function fetchZones(): Promise<ZoneMetric[]> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/zones`, { cache: "no-store" });
  if (!res.ok) throw new Error(`zones fetch failed: HTTP ${res.status}`);
  const data = (await res.json()) as { zones: ZoneMetric[] };
  return data.zones;
}

export async function fetchInterventions(): Promise<Intervention[]> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/interventions`, { cache: "no-store" });
  if (!res.ok) throw new Error(`interventions fetch failed: HTTP ${res.status}`);
  const data = (await res.json()) as { interventions: Intervention[] };
  return data.interventions;
}

export async function applyIntervention(payload: {
  zone_id: string;
  type: InterventionType;
  message?: string;
}): Promise<Intervention> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/interventions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`intervention apply failed: HTTP ${res.status}`);
  return (await res.json()) as Intervention;
}

interface StreamHandlers {
  onMetric: (m: ZoneMetric) => void;
  onIntervention?: (iv: Intervention) => void;
  onOpen?: () => void;
  onError?: () => void;
}

/**
 * Live streaming over WebSocket (two-way liveness + auto-reconnect).
 * Frames are envelopes ({event,data}); a fresh metric snapshot is pushed on
 * connect, and interventions arrive as they execute (autonomous or manual).
 */
export function streamZonesWS(handlers: StreamHandlers): () => void {
  let closed = false;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let pongTimeout: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempts = 0;

  const connect = () => {
    ws = new WebSocket(`${API_WS}/api/v1/ws`);
    ws.onopen = () => {
      reconnectAttempts = 0;
      handlers.onOpen?.();
      pingTimer = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: "ping" }));
          pongTimeout = setTimeout(() => ws?.close(), 5000);
        }
      }, 15000);
    };
    ws.onmessage = (e) => {
      try {
        const frame = JSON.parse(e.data) as WSFrame;
        if (frame.event === "pong") {
          if (pongTimeout) clearTimeout(pongTimeout);
          return;
        }
        if (frame.event === "intervention") {
          handlers.onIntervention?.(frame.data as Intervention);
        } else {
          handlers.onMetric(frame.data as ZoneMetric);
        }
      } catch {
        /* skip malformed frame */
      }
    };
    ws.onerror = () => handlers.onError?.();
    ws.onclose = () => {
      if (pingTimer) clearInterval(pingTimer);
      if (pongTimeout) clearTimeout(pongTimeout);
      if (!closed) {
        const delay = Math.min(2000 * Math.pow(2, reconnectAttempts), 30000);
        reconnectAttempts++;
        reconnectTimer = setTimeout(connect, delay);
      }
    };
  };

  connect();
  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (pingTimer) clearInterval(pingTimer);
    if (pongTimeout) clearTimeout(pongTimeout);
    ws?.close();
  };
}

/** SSE fallback (server-sent events) for environments without WebSockets. */
export function streamZones(handlers: StreamHandlers): () => void {
  const es = new EventSource(`${API_BASE}/api/v1/stream`);
  const on = (name: string, handle: (data: unknown) => void) => {
    es.addEventListener(name, (e) => {
      try {
        handle(JSON.parse((e as MessageEvent).data));
      } catch {
        /* skip malformed frame */
      }
    });
  };
  on("metric", (d) => handlers.onMetric(d as ZoneMetric));
  on("snapshot", (d) => handlers.onMetric(d as ZoneMetric));
  on("intervention", (d) => handlers.onIntervention?.(d as Intervention));
  es.onerror = () => handlers.onError?.();
  return () => es.close();
}
