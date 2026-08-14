import React from "react";
import { render, screen, act } from "@testing-library/react";
import TopBar from "@/components/TopBar";
import type { ZoneMetric } from "@/lib/types";

describe("components/TopBar", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  const sampleZones: ZoneMetric[] = [
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
    {
      zone_id: "SECURITY_T1",
      capacity: 100,
      density: 0.85,
      occupancy: 85,
      congestion: "HIGH",
      inflow_rate: 12,
      outflow_rate: 4,
      timestamp: "2026-08-14T06:00:00Z",
    },
    {
      zone_id: "GATE_B",
      capacity: 100,
      density: 0.95,
      occupancy: 95,
      congestion: "CRITICAL",
      inflow_rate: 15,
      outflow_rate: 2,
      timestamp: "2026-08-14T06:00:00Z",
    },
    {
      zone_id: "CONCOURSE_A",
      capacity: 200,
      density: 0.25,
      occupancy: 50,
      congestion: "LOW",
      inflow_rate: 2,
      outflow_rate: 2,
      timestamp: "2026-08-14T06:00:00Z",
    },
  ];

  it("renders header branding and titles", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ mode: "simulated" }), { status: 200 })
    );

    await act(async () => {
      render(<TopBar zones={sampleZones} connected={true} interventionCount={4} />);
    });

    expect(screen.getByText(/CROWD/i)).toBeInTheDocument();
    expect(screen.getByText(/OPTIMISER/i)).toBeInTheDocument();
    expect(screen.getByText(/DECENTRALIZED ZONE-AGENT NETWORK/i)).toBeInTheDocument();
  });

  it("renders STREAM::LIVE when connected is true", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ mode: "simulated" }), { status: 200 })
    );

    await act(async () => {
      render(<TopBar zones={sampleZones} connected={true} interventionCount={0} />);
    });

    expect(screen.getByText("STREAM::LIVE")).toBeInTheDocument();
    expect(screen.getByText("STREAM::LIVE")).toHaveClass("text-terminal");
  });

  it("renders STREAM::LOST when connected is false", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ mode: "simulated" }), { status: 200 })
    );

    await act(async () => {
      render(<TopBar zones={sampleZones} connected={false} interventionCount={0} />);
    });

    expect(screen.getByText("STREAM::LOST")).toBeInTheDocument();
    expect(screen.getByText("STREAM::LOST")).toHaveClass("text-term-red");
  });

  it("calculates and displays aggregate metrics correctly", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ mode: "simulated" }), { status: 200 })
    );

    await act(async () => {
      render(<TopBar zones={sampleZones} connected={true} interventionCount={7} />);
    });

    // Total Zones = 4
    expect(screen.getByText("4")).toBeInTheDocument();
    // Occupancy / Capacity = 310/500
    expect(screen.getByText("310/500")).toBeInTheDocument();
    // HIGH count = 2
    const highStat = screen.getByText("2");
    expect(highStat).toBeInTheDocument();
    expect(highStat).toHaveClass("text-term-amber");
    // CRITICAL count = 1
    const critStat = screen.getByText("1");
    expect(critStat).toBeInTheDocument();
    expect(critStat).toHaveClass("text-term-red");
    // Interventions = 7
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders TelemetrySource with live mode label when healthz reports live mode", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ mode: "live" }), { status: 200 })
    );

    await act(async () => {
      render(<TopBar zones={sampleZones} connected={true} interventionCount={0} />);
    });

    expect(
      screen.getByText("telemetry: HF live inference · synthetic input")
    ).toBeInTheDocument();
  });

  it("renders TelemetrySource with simulated fallback when healthz reports simulated or fails", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("Network Error"));

    await act(async () => {
      render(<TopBar zones={sampleZones} connected={true} interventionCount={0} />);
    });

    expect(
      screen.getByText("telemetry: vision seam · simulated input")
    ).toBeInTheDocument();
  });

  it("polls TelemetrySource healthz on a 30-second interval", async () => {
    jest.useFakeTimers();

    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ mode: "simulated" }), { status: 200 })
    );

    let unmountFn: () => void = () => {};
    await act(async () => {
      const { unmount } = render(
        <TopBar zones={sampleZones} connected={true} interventionCount={0} />
      );
      unmountFn = unmount;
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Fast-forward 30s
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);

    // Unmount and verify polling stops
    await act(async () => {
      unmountFn();
    });

    await act(async () => {
      jest.advanceTimersByTime(60000);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
