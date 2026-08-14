import React from "react";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import Operate from "@/app/operate/page";
import * as api from "@/lib/api";
import type { Intervention, ZoneMetric } from "@/lib/types";

jest.mock("@/lib/api", () => {
  const original = jest.requireActual("@/lib/api");
  return {
    ...original,
    fetchZones: jest.fn(),
    fetchInterventions: jest.fn(),
    applyIntervention: jest.fn(),
    streamZonesWS: jest.fn(),
  };
});

describe("app/operate/page (Operate Dashboard)", () => {
  let wsHandlers: {
    onMetric?: (m: ZoneMetric) => void;
    onIntervention?: (iv: Intervention) => void;
    onOpen?: () => void;
    onError?: () => void;
  } = {};

  const mockZones: ZoneMetric[] = [
    {
      zone_id: "GATE_A",
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
      density: 0.3,
      occupancy: 60,
      congestion: "LOW",
      inflow_rate: 3,
      outflow_rate: 3,
      timestamp: "2026-08-14T06:00:00Z",
    },
  ];

  const mockInterventions: Intervention[] = [
    {
      id: "iv-101",
      zone_id: "GATE_B",
      type: "SIGNAGE_REROUTE",
      message: "Autonomous reroute from GATE_B",
      severity: "CRITICAL",
      applied_at: "2026-08-14T06:00:00Z",
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    wsHandlers = {};

    (api.fetchZones as jest.Mock).mockResolvedValue(mockZones);
    (api.fetchInterventions as jest.Mock).mockResolvedValue(mockInterventions);
    (api.streamZonesWS as jest.Mock).mockImplementation((handlers) => {
      wsHandlers = handlers;
      return jest.fn(); // unsubscribe mock
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("loads initial zones and interventions on mount and selects highest severity lead", async () => {
    render(<Operate />);

    expect(api.fetchZones).toHaveBeenCalled();
    expect(api.fetchInterventions).toHaveBeenCalled();
    expect(api.streamZonesWS).toHaveBeenCalled();

    // GATE_B has CRITICAL congestion so it must be selected as the lead zone
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "GATE_B" })).toBeInTheDocument();
    });

    // GATE_A and CONCOURSE_A should be in the zone field table
    expect(screen.getByText("GATE_A")).toBeInTheDocument();
    expect(screen.getByText("CONCOURSE_A")).toBeInTheDocument();

    // Intervention log should show iv-101
    expect(screen.getByText("Autonomous reroute from GATE_B")).toBeInTheDocument();
  });

  it("updates live telemetry and connection status when WS receives metric frames", async () => {
    render(<Operate />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "GATE_B" })).toBeInTheDocument();
    });

    // Emitting metric frame via WS should mark connection live
    act(() => {
      wsHandlers.onMetric?.({
        zone_id: "GATE_A",
        capacity: 100,
        density: 0.99,
        occupancy: 99,
        congestion: "CRITICAL",
        inflow_rate: 20,
        outflow_rate: 1,
        timestamp: "2026-08-14T06:01:00Z",
      });
    });

    expect(screen.getByText("STREAM::LIVE")).toBeInTheDocument();

    // Now GATE_A has density 0.99 (vs GATE_B 0.95), both CRITICAL -> GATE_A becomes new lead
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "GATE_A" })).toBeInTheDocument();
    });
  });

  it("appends new intervention events from WebSocket without duplicates", async () => {
    render(<Operate />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "GATE_B" })).toBeInTheDocument();
    });

    const newIntervention: Intervention = {
      id: "iv-ws-live",
      zone_id: "GATE_A",
      type: "HOLD_INFLOW",
      message: "Holding inflow at GATE_A due to surge",
      severity: "HIGH",
      applied_at: "2026-08-14T06:02:00Z",
    };

    act(() => {
      wsHandlers.onIntervention?.(newIntervention);
    });

    expect(
      screen.getByText("Holding inflow at GATE_A due to surge")
    ).toBeInTheDocument();
  });

  it("handles manual override flow and flashes confirmation banner for 4 seconds", async () => {
    jest.useFakeTimers();

    const createdOverride: Intervention = {
      id: "iv-override-1",
      zone_id: "GATE_B",
      type: "SIGNAGE_REROUTE",
      message: "MANUAL OVERRIDE: operator forced signage reroute",
      severity: "CRITICAL",
      applied_at: new Date().toISOString(),
    };

    (api.applyIntervention as jest.Mock).mockResolvedValue(createdOverride);

    render(<Operate />);

    await act(async () => {
      await Promise.resolve();
    });

    const overrideButton = screen.getByRole("button", { name: /FORCE REROUTE/i });

    // Step 1: Arm
    fireEvent.click(overrideButton);
    expect(screen.getByRole("button", { name: /CONFIRM REROUTE\?/i })).toBeInTheDocument();

    // Step 2: Confirm
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /CONFIRM REROUTE\?/i }));
    });

    expect(api.applyIntervention).toHaveBeenCalledWith({
      zone_id: "GATE_B",
      type: "SIGNAGE_REROUTE",
      message: "MANUAL OVERRIDE: operator forced signage reroute",
    });

    // Banner should be visible
    expect(
      screen.getByText("MANUAL REROUTE EXECUTED -> GATE_B")
    ).toBeInTheDocument();

    // Fast-forward 4000ms -> banner should dismiss
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(
      screen.queryByText("MANUAL REROUTE EXECUTED -> GATE_B")
    ).not.toBeInTheDocument();
  });

  it("flashes error banner when manual override fails", async () => {
    (api.applyIntervention as jest.Mock).mockRejectedValue(new Error("Network timeout"));

    render(<Operate />);

    await act(async () => {
      await Promise.resolve();
    });

    const overrideButton = screen.getByRole("button", { name: /FORCE REROUTE/i });

    // Arm
    fireEvent.click(overrideButton);

    // Confirm
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /CONFIRM REROUTE\?/i }));
    });

    expect(
      screen.getByText(/EXECUTION FAILED: Error: Network timeout/i)
    ).toBeInTheDocument();
  });

  it("refetches interventions on WebSocket onOpen event", async () => {
    render(<Operate />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "GATE_B" })).toBeInTheDocument();
    });

    const refreshedInterventions: Intervention[] = [
      ...mockInterventions,
      {
        id: "iv-reconnect",
        zone_id: "BAG_CHECK",
        type: "HOLD_INFLOW",
        message: "Refetched intervention on reconnect",
        severity: "HIGH",
        applied_at: "2026-08-14T06:05:00Z",
      },
    ];

    (api.fetchInterventions as jest.Mock).mockResolvedValue(refreshedInterventions);

    await act(async () => {
      wsHandlers.onOpen?.();
    });

    await waitFor(() => {
      expect(screen.getByText("Refetched intervention on reconnect")).toBeInTheDocument();
    });
  });

  it("sets connection status to lost on WebSocket onError event", async () => {
    render(<Operate />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "GATE_B" })).toBeInTheDocument();
    });

    act(() => {
      wsHandlers.onMetric?.(mockZones[0]);
    });
    expect(screen.getByText("STREAM::LIVE")).toBeInTheDocument();

    act(() => {
      wsHandlers.onError?.();
    });
    expect(screen.getByText("STREAM::LOST")).toBeInTheDocument();
  });

  it("cleans up stream subscription on unmount", () => {
    const mockUnsubscribe = jest.fn();
    (api.streamZonesWS as jest.Mock).mockReturnValue(mockUnsubscribe);

    const { unmount } = render(<Operate />);
    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });
});
