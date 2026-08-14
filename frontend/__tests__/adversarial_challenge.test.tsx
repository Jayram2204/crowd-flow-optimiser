import React from "react";
import { render, screen, act } from "@testing-library/react";
import { pct, CONGESTION_STYLE } from "@/components/congestion";
import ZoneRow from "@/components/ZoneRow";
import ZoneLead from "@/components/ZoneLead";
import { streamZonesWS } from "@/lib/api";
import type { ZoneMetric } from "@/lib/types";

describe("Adversarial Challenger 2 — Frontend UI Boundary & Stress Tests", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe("Edge Case 1: Zero & Sub-Zero Capacity Handling", () => {
    it("safely handles 0 capacity without NaN or Infinity", () => {
      expect(pct(0, 0)).toBe(0);
      expect(pct(50, 0)).toBe(0);
      expect(pct(-10, 0)).toBe(0);
      expect(Number.isNaN(pct(0, 0))).toBe(false);
      expect(Number.isFinite(pct(50, 0))).toBe(true);
    });

    it("safely handles negative capacity without crashing", () => {
      expect(pct(50, -100)).toBe(0);
      expect(pct(-20, -50)).toBe(0);
    });

    it("renders ZoneRow with zero capacity gracefully", () => {
      const zeroCapZone: ZoneMetric = {
        zone_id: "GATE_ZERO",
        capacity: 0,
        density: 0.0,
        occupancy: 0,
        congestion: "LOW",
        inflow_rate: 0,
        outflow_rate: 0,
        timestamp: "2026-08-14T06:00:00Z",
      };

      const { container } = render(<ZoneRow zone={zeroCapZone} />);
      expect(screen.getByText("GATE_ZERO")).toBeInTheDocument();
      expect(screen.getByText("0")).toBeInTheDocument();
      expect(screen.getByText("/0")).toBeInTheDocument();
      expect(screen.getByText("0%")).toBeInTheDocument();
      // Ensure no NaN text in DOM
      expect(container.textContent).not.toContain("NaN");
      expect(container.textContent).not.toContain("Infinity");
    });

    it("renders ZoneLead with zero capacity gracefully", () => {
      const zeroCapZone: ZoneMetric = {
        zone_id: "GATE_ZERO_LEAD",
        capacity: 0,
        density: 0.0,
        occupancy: 0,
        congestion: "LOW",
        inflow_rate: 0,
        outflow_rate: 0,
        timestamp: "2026-08-14T06:00:00Z",
      };

      const { container } = render(
        <ZoneLead
          zone={zeroCapZone}
          autoAction={null}
          onOverride={jest.fn()}
          busy={false}
        />
      );
      expect(screen.getByText("GATE_ZERO_LEAD")).toBeInTheDocument();
      expect(screen.getByText(/\/ 0/)).toBeInTheDocument();
      expect(container.textContent).not.toContain("NaN");
      expect(container.textContent).not.toContain("Infinity");
    });
  });

  describe("Edge Case 2: Negative Occupancy Values", () => {
    it("evaluates pct with negative occupancy without NaN/Infinity", () => {
      const result = pct(-25, 100);
      expect(Number.isNaN(result)).toBe(false);
      expect(Number.isFinite(result)).toBe(true);
      expect(result).toBe(-25);
    });

    it("renders ZoneRow with negative occupancy without breaking", () => {
      const negZone: ZoneMetric = {
        zone_id: "PLATFORM_NEG",
        capacity: 100,
        density: -0.1,
        occupancy: -10,
        congestion: "LOW",
        inflow_rate: 0,
        outflow_rate: 2,
        timestamp: "2026-08-14T06:00:00Z",
      };

      const { container } = render(<ZoneRow zone={negZone} />);
      expect(screen.getByText("PLATFORM_NEG")).toBeInTheDocument();
      expect(screen.getByText("-10")).toBeInTheDocument();
      expect(screen.getByText("-10%")).toBeInTheDocument();
      expect(container.textContent).not.toContain("NaN");
    });

    it("renders ZoneLead with negative occupancy without breaking", () => {
      const negZone: ZoneMetric = {
        zone_id: "PLATFORM_NEG_LEAD",
        capacity: 100,
        density: -0.1,
        occupancy: -10,
        congestion: "LOW",
        inflow_rate: 0,
        outflow_rate: 2,
        timestamp: "2026-08-14T06:00:00Z",
      };

      const { container } = render(
        <ZoneLead
          zone={negZone}
          autoAction={null}
          onOverride={jest.fn()}
          busy={false}
        />
      );
      expect(screen.getByText("PLATFORM_NEG_LEAD")).toBeInTheDocument();
      expect(screen.getAllByText("-10").length).toBeGreaterThanOrEqual(1);
      expect(container.textContent).not.toContain("NaN");
    });
  });

  describe("Edge Case 3: Over-100% Capacity Clamping & Visual Overflow Protection", () => {
    it("clamps bar fill and displayed pct to 100% for extreme over-capacity", () => {
      expect(pct(150, 100)).toBe(100);
      expect(pct(500, 100)).toBe(100);
      expect(pct(10000, 100)).toBe(100);
    });

    it("renders ZoneRow at 200% capacity with 100% bar fill and actual overload numeral", () => {
      const overloadZone: ZoneMetric = {
        zone_id: "OVERLOAD_GATE",
        capacity: 100,
        density: 2.0,
        occupancy: 200,
        congestion: "CRITICAL",
        inflow_rate: 30,
        outflow_rate: 5,
        timestamp: "2026-08-14T06:00:00Z",
      };

      const { container } = render(<ZoneRow zone={overloadZone} />);
      expect(screen.getByText("OVERLOAD_GATE")).toBeInTheDocument();
      expect(screen.getByText("200")).toBeInTheDocument();
      expect(screen.getByText("/100")).toBeInTheDocument();
      expect(screen.getByText("100%")).toBeInTheDocument();

      // Check bar width style
      const barContainer = container.querySelector(".bg-void");
      const bar = barContainer?.firstElementChild;
      expect(bar).toHaveStyle({ width: "100%" });

      // Check overflow container
      expect(barContainer).toHaveClass("overflow-hidden");
    });

    it("renders ZoneLead at 150% capacity with clamped 100% bar fill and unclipped container", () => {
      const overloadZone: ZoneMetric = {
        zone_id: "OVERLOAD_LEAD",
        capacity: 100,
        density: 1.5,
        occupancy: 150,
        congestion: "CRITICAL",
        inflow_rate: 25,
        outflow_rate: 3,
        timestamp: "2026-08-14T06:00:00Z",
      };

      const { container } = render(
        <ZoneLead
          zone={overloadZone}
          autoAction={null}
          onOverride={jest.fn()}
          busy={false}
        />
      );
      expect(screen.getByText("OVERLOAD_LEAD")).toBeInTheDocument();
      expect(screen.getByText("150")).toBeInTheDocument();
      expect(screen.getByText(/\/ 100/)).toBeInTheDocument();
      expect(screen.getByText("100")).toBeInTheDocument();

      const barContainer = container.querySelector(".bg-void");
      const bar = barContainer?.firstElementChild;
      expect(bar).toHaveStyle({ width: "100%" });
      expect(barContainer).toHaveClass("overflow-hidden");
    });
  });

  describe("Edge Case 4: WebSocket Reconnect Spamming & Stress Backoff", () => {
    class MockWS {
      static OPEN = 1;
      static CLOSED = 3;
      readyState = MockWS.OPEN;
      url: string;
      onopen: (() => void) | null = null;
      onmessage: ((e: { data: string }) => void) | null = null;
      onerror: (() => void) | null = null;
      onclose: (() => void) | null = null;
      send = jest.fn();
      close = jest.fn(() => {
        this.readyState = MockWS.CLOSED;
        if (this.onclose) this.onclose();
      });

      constructor(url: string) {
        this.url = url;
        createdSockets.push(this);
      }
    }

    let createdSockets: MockWS[] = [];
    const originalWS = global.WebSocket;

    beforeEach(() => {
      createdSockets = [];
      // @ts-expect-error Mock
      global.WebSocket = MockWS;
    });

    afterEach(() => {
      global.WebSocket = originalWS;
    });

    it("survives rapid successive disconnect cycles and respects 30s max backoff cap", () => {
      jest.useFakeTimers();
      const onMetric = jest.fn();
      const onError = jest.fn();

      const unsubscribe = streamZonesWS({ onMetric, onError });
      expect(createdSockets.length).toBe(1);

      // Simulate 10 rapid disconnects in a row
      // Expected delays: 2s, 4s, 8s, 16s, 30s, 30s, 30s, 30s, 30s, 30s
      const expectedDelays = [2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000, 30000, 30000];

      for (let i = 0; i < expectedDelays.length; i++) {
        const currentSocket = createdSockets[createdSockets.length - 1];
        currentSocket.onclose?.();

        const delay = expectedDelays[i];
        // Before delay expires, no new socket should exist
        jest.advanceTimersByTime(delay - 1);
        expect(createdSockets.length).toBe(i + 1);

        // At delay expiry, new socket connects
        jest.advanceTimersByTime(1);
        expect(createdSockets.length).toBe(i + 2);
      }

      // Verify that after 10 reconnect attempts, backoff is strictly capped at 30,000ms
      const lastSocket = createdSockets[createdSockets.length - 1];
      lastSocket.onclose?.();
      jest.advanceTimersByTime(29999);
      expect(createdSockets.length).toBe(expectedDelays.length + 1);
      jest.advanceTimersByTime(1);
      expect(createdSockets.length).toBe(expectedDelays.length + 2);

      // Clean teardown cancels timers
      unsubscribe();
      jest.advanceTimersByTime(120000);
      expect(createdSockets.length).toBe(expectedDelays.length + 2);
    });

    it("resets reconnect backoff to base 2000ms upon successful connection opening", () => {
      jest.useFakeTimers();
      const onOpen = jest.fn();
      const onMetric = jest.fn();

      const unsubscribe = streamZonesWS({ onOpen, onMetric });
      let socket = createdSockets[0];

      // Fail 3 times -> next delay is 16s
      socket.onclose?.();
      jest.advanceTimersByTime(2000); // 1st reconnect
      socket = createdSockets[1];

      socket.onclose?.();
      jest.advanceTimersByTime(4000); // 2nd reconnect
      socket = createdSockets[2];

      socket.onclose?.();
      jest.advanceTimersByTime(8000); // 3rd reconnect
      socket = createdSockets[3];

      // Now successful onopen!
      socket.onopen?.();
      expect(onOpen).toHaveBeenCalledTimes(1);

      // Now next close should reset backoff back to 2000ms (not 16000ms)
      socket.onclose?.();
      jest.advanceTimersByTime(1999);
      expect(createdSockets.length).toBe(4);
      jest.advanceTimersByTime(1);
      expect(createdSockets.length).toBe(5);

      unsubscribe();
    });
  });
});
