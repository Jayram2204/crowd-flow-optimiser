import {
  API_BASE,
  API_WS,
  fetchWithTimeout,
  fetchZones,
  fetchInterventions,
  applyIntervention,
  streamZonesWS,
  streamZones,
} from "@/lib/api";
import type { Intervention, ZoneMetric } from "@/lib/types";

describe("lib/api", () => {
  const originalFetch = global.fetch;
  const originalWebSocket = global.WebSocket;
  const originalEventSource = global.EventSource;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    global.WebSocket = originalWebSocket;
    global.EventSource = originalEventSource;
    jest.useRealTimers();
  });

  describe("API constants", () => {
    it("should configure API_BASE and API_WS correctly", () => {
      expect(API_BASE).toBeDefined();
      expect(API_WS).toMatch(/^ws/);
    });
  });

  describe("fetchWithTimeout", () => {
    it("should successfully fetch data within the timeout", async () => {
      const mockResponse = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      const res = await fetchWithTimeout("http://localhost:8080/test", {}, 1000);
      expect(res.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledWith(
        "http://localhost:8080/test",
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
    });

    it("should abort the request when timeout occurs", async () => {
      jest.useFakeTimers();

      global.fetch = jest.fn().mockImplementation((_url, { signal }: { signal: AbortSignal }) => {
        return new Promise((_, reject) => {
          signal.addEventListener("abort", () => {
            const error = new Error("The operation was aborted");
            error.name = "AbortError";
            reject(error);
          });
        });
      });

      const promise = fetchWithTimeout("http://localhost:8080/slow", {}, 2000);
      jest.advanceTimersByTime(2500);

      await expect(promise).rejects.toThrow("The operation was aborted");
    });
  });

  describe("fetchZones", () => {
    it("should fetch zones and return ZoneMetric array on 200 OK", async () => {
      const mockZones: ZoneMetric[] = [
        {
          zone_id: "GATE_A",
          capacity: 100,
          density: 0.8,
          occupancy: 80,
          congestion: "HIGH",
          inflow_rate: 10,
          outflow_rate: 5,
          timestamp: "2026-08-14T06:00:00Z",
        },
      ];

      global.fetch = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ zones: mockZones }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const result = await fetchZones();
      expect(result).toEqual(mockZones);
      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/api/v1/zones`,
        expect.objectContaining({ cache: "no-store" })
      );
    });

    it("should throw an error when zones response is not ok", async () => {
      global.fetch = jest.fn().mockResolvedValue(
        new Response("Server Error", { status: 500 })
      );

      await expect(fetchZones()).rejects.toThrow("zones fetch failed: HTTP 500");
    });
  });

  describe("fetchInterventions", () => {
    it("should fetch interventions and return Intervention array on 200 OK", async () => {
      const mockInterventions: Intervention[] = [
        {
          id: "iv-1",
          zone_id: "GATE_A",
          type: "SIGNAGE_REROUTE",
          message: "Reroute to GATE_B",
          severity: "HIGH",
          applied_at: "2026-08-14T06:00:00Z",
        },
      ];

      global.fetch = jest.fn().mockResolvedValue(
        new Response(JSON.stringify({ interventions: mockInterventions }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const result = await fetchInterventions();
      expect(result).toEqual(mockInterventions);
      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/api/v1/interventions`,
        expect.objectContaining({ cache: "no-store" })
      );
    });

    it("should throw an error when interventions response is not ok", async () => {
      global.fetch = jest.fn().mockResolvedValue(
        new Response("Not Found", { status: 404 })
      );

      await expect(fetchInterventions()).rejects.toThrow("interventions fetch failed: HTTP 404");
    });
  });

  describe("applyIntervention", () => {
    it("should send POST request and return created Intervention on 200 OK", async () => {
      const mockCreated: Intervention = {
        id: "iv-created",
        zone_id: "GATE_A",
        type: "SIGNAGE_REROUTE",
        message: "MANUAL OVERRIDE: operator forced signage reroute",
        severity: "HIGH",
        applied_at: "2026-08-14T06:01:00Z",
      };

      global.fetch = jest.fn().mockResolvedValue(
        new Response(JSON.stringify(mockCreated), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        })
      );

      const result = await applyIntervention({
        zone_id: "GATE_A",
        type: "SIGNAGE_REROUTE",
        message: "MANUAL OVERRIDE: operator forced signage reroute",
      });

      expect(result).toEqual(mockCreated);
      expect(global.fetch).toHaveBeenCalledWith(
        `${API_BASE}/api/v1/interventions`,
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            zone_id: "GATE_A",
            type: "SIGNAGE_REROUTE",
            message: "MANUAL OVERRIDE: operator forced signage reroute",
          }),
        })
      );
    });

    it("should throw an error when intervention apply response is not ok", async () => {
      global.fetch = jest.fn().mockResolvedValue(
        new Response("Bad Request", { status: 400 })
      );

      await expect(
        applyIntervention({
          zone_id: "GATE_A",
          type: "SIGNAGE_REROUTE",
        })
      ).rejects.toThrow("intervention apply failed: HTTP 400");
    });
  });

  describe("streamZonesWS", () => {
    class MockWebSocket {
      static OPEN = 1;
      static CLOSED = 3;
      readyState = MockWebSocket.OPEN;
      url: string;
      onopen: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      send = jest.fn();
      close = jest.fn(() => {
        this.readyState = MockWebSocket.CLOSED;
        if (this.onclose) this.onclose();
      });

      constructor(url: string) {
        this.url = url;
        lastCreatedSocket = this;
      }
    }

    let lastCreatedSocket: MockWebSocket | null = null;

    beforeEach(() => {
      lastCreatedSocket = null;
      // @ts-expect-error Mocking WebSocket constructor
      global.WebSocket = MockWebSocket;
    });

    it("should connect to the WebSocket endpoint and handle open event", () => {
      const onOpen = jest.fn();
      const onMetric = jest.fn();

      const unsubscribe = streamZonesWS({ onOpen, onMetric });
      expect(lastCreatedSocket?.url).toBe(`${API_WS}/api/v1/ws`);

      lastCreatedSocket?.onopen?.();
      expect(onOpen).toHaveBeenCalledTimes(1);

      unsubscribe();
    });

    it("should dispatch metric and intervention frames to handlers", () => {
      const onMetric = jest.fn();
      const onIntervention = jest.fn();

      const unsubscribe = streamZonesWS({ onMetric, onIntervention });
      lastCreatedSocket?.onopen?.();

      const metricData: ZoneMetric = {
        zone_id: "GATE_A",
        capacity: 100,
        density: 0.5,
        occupancy: 50,
        congestion: "MODERATE",
        inflow_rate: 5,
        outflow_rate: 5,
        timestamp: "2026-08-14T06:00:00Z",
      };

      // Send metric frame
      lastCreatedSocket?.onmessage?.({
        data: JSON.stringify({ event: "metric", data: metricData }),
      });
      expect(onMetric).toHaveBeenCalledWith(metricData);

      // Send intervention frame
      const interventionData: Intervention = {
        id: "iv-ws-1",
        zone_id: "GATE_A",
        type: "HOLD_INFLOW",
        message: "Holding inflow at GATE_A",
        severity: "MODERATE",
        applied_at: "2026-08-14T06:00:10Z",
      };
      lastCreatedSocket?.onmessage?.({
        data: JSON.stringify({ event: "intervention", data: interventionData }),
      });
      expect(onIntervention).toHaveBeenCalledWith(interventionData);

      unsubscribe();
    });

    it("should silently ignore malformed JSON messages", () => {
      const onMetric = jest.fn();
      const unsubscribe = streamZonesWS({ onMetric });

      expect(() => {
        lastCreatedSocket?.onmessage?.({ data: "INVALID JSON {{" });
      }).not.toThrow();

      expect(onMetric).not.toHaveBeenCalled();
      unsubscribe();
    });

    it("should call onError handler on socket error", () => {
      const onError = jest.fn();
      const onMetric = jest.fn();

      const unsubscribe = streamZonesWS({ onError, onMetric });
      lastCreatedSocket?.onerror?.();
      expect(onError).toHaveBeenCalledTimes(1);

      unsubscribe();
    });

    it("should send periodic ping and handle pong frame response", () => {
      jest.useFakeTimers();
      const onMetric = jest.fn();

      const unsubscribe = streamZonesWS({ onMetric });
      const socket = lastCreatedSocket!;
      socket.onopen?.();

      // Advance 15s to trigger ping interval
      jest.advanceTimersByTime(15000);
      expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ event: "ping" }));

      // Receive pong frame within 5s
      socket.onmessage?.({ data: JSON.stringify({ event: "pong" }) });

      // Advance another 6s — socket should NOT close since pong was received
      jest.advanceTimersByTime(6000);
      expect(socket.close).not.toHaveBeenCalled();

      unsubscribe();
    });

    it("should close socket if pong is not received within 5 seconds", () => {
      jest.useFakeTimers();
      const onMetric = jest.fn();

      const unsubscribe = streamZonesWS({ onMetric });
      const socket = lastCreatedSocket!;
      socket.onopen?.();

      // Advance 15s to trigger ping
      jest.advanceTimersByTime(15000);
      expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ event: "ping" }));

      // Advance 5s without sending pong -> timeout closes socket
      jest.advanceTimersByTime(5000);
      expect(socket.close).toHaveBeenCalled();

      unsubscribe();
    });

    it("should reconnect with exponential backoff on socket close", () => {
      jest.useFakeTimers();
      const onMetric = jest.fn();

      const unsubscribe = streamZonesWS({ onMetric });
      const firstSocket = lastCreatedSocket!;

      // Trigger close
      firstSocket.onclose?.();

      // Delay for first attempt is 2000 * 2^0 = 2000ms
      jest.advanceTimersByTime(1999);
      expect(lastCreatedSocket).toBe(firstSocket);

      jest.advanceTimersByTime(1);
      const secondSocket = lastCreatedSocket!;
      expect(secondSocket).not.toBe(firstSocket);

      // Trigger second close: delay is 2000 * 2^1 = 4000ms
      secondSocket.onclose?.();
      jest.advanceTimersByTime(3999);
      expect(lastCreatedSocket).toBe(secondSocket);

      jest.advanceTimersByTime(1);
      const thirdSocket = lastCreatedSocket!;
      expect(thirdSocket).not.toBe(secondSocket);

      unsubscribe();
    });

    it("should not reconnect if stream is unsubscribed / closed", () => {
      jest.useFakeTimers();
      const onMetric = jest.fn();

      const unsubscribe = streamZonesWS({ onMetric });
      const socket = lastCreatedSocket!;

      unsubscribe();
      expect(socket.close).toHaveBeenCalled();

      jest.advanceTimersByTime(60000);
      // No new socket should be created
      expect(lastCreatedSocket).toBe(socket);
    });
  });

  describe("streamZones (SSE)", () => {
    class MockEventSource {
      url: string;
      listeners: Record<string, ((event: { data: string }) => void)[]> = {};
      onerror: (() => void) | null = null;
      close = jest.fn();

      constructor(url: string) {
        this.url = url;
        lastCreatedES = this;
      }

      addEventListener(name: string, cb: (event: { data: string }) => void) {
        if (!this.listeners[name]) this.listeners[name] = [];
        this.listeners[name].push(cb);
      }

      dispatchEvent(name: string, data: unknown) {
        const cbs = this.listeners[name] || [];
        for (const cb of cbs) {
          cb({ data: typeof data === "string" ? data : JSON.stringify(data) });
        }
      }
    }

    let lastCreatedES: MockEventSource | null = null;

    beforeEach(() => {
      lastCreatedES = null;
      // @ts-expect-error Mocking EventSource constructor
      global.EventSource = MockEventSource;
    });

    it("should connect to SSE stream and register listeners for metric, snapshot, intervention", () => {
      const onMetric = jest.fn();
      const onIntervention = jest.fn();
      const onError = jest.fn();

      const unsubscribe = streamZones({ onMetric, onIntervention, onError });
      expect(lastCreatedES?.url).toBe(`${API_BASE}/api/v1/stream`);

      const metricSample: ZoneMetric = {
        zone_id: "E_PIER",
        capacity: 200,
        density: 0.2,
        occupancy: 40,
        congestion: "LOW",
        inflow_rate: 2,
        outflow_rate: 2,
        timestamp: "2026-08-14T06:00:00Z",
      };

      // Test "metric" event
      lastCreatedES?.dispatchEvent("metric", metricSample);
      expect(onMetric).toHaveBeenCalledWith(metricSample);

      // Test "snapshot" event
      lastCreatedES?.dispatchEvent("snapshot", metricSample);
      expect(onMetric).toHaveBeenCalledTimes(2);

      // Test "intervention" event
      const ivSample: Intervention = {
        id: "iv-sse",
        zone_id: "E_PIER",
        type: "DYNAMIC_SHUTTLE",
        message: "Deploying dynamic shuttle",
        severity: "LOW",
        applied_at: "2026-08-14T06:00:00Z",
      };
      lastCreatedES?.dispatchEvent("intervention", ivSample);
      expect(onIntervention).toHaveBeenCalledWith(ivSample);

      // Test error handling
      lastCreatedES?.onerror?.();
      expect(onError).toHaveBeenCalledTimes(1);

      // Test malformed payload handling
      expect(() => {
        lastCreatedES?.dispatchEvent("metric", "NOT VALID JSON");
      }).not.toThrow();

      // Test close
      unsubscribe();
      expect(lastCreatedES?.close).toHaveBeenCalledTimes(1);
    });
  });
});
