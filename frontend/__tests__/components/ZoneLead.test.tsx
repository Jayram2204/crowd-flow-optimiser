import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import ZoneLead from "@/components/ZoneLead";
import type { Intervention, ZoneMetric } from "@/lib/types";

describe("components/ZoneLead", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const baseZone: ZoneMetric = {
    zone_id: "GATE_A",
    capacity: 100,
    density: 0.85,
    occupancy: 85,
    congestion: "HIGH",
    inflow_rate: 12.4,
    outflow_rate: 4.2,
    timestamp: "2026-08-14T06:00:00Z",
  };

  it("renders lead zone id, percentage occupancy, and telemetry metrics", () => {
    render(
      <ZoneLead
        zone={baseZone}
        autoAction={null}
        onOverride={jest.fn()}
        busy={false}
      />
    );

    expect(screen.getByText("GATE_A")).toBeInTheDocument();
    expect(screen.getAllByText("85").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("HIGH")).toBeInTheDocument();
    expect(screen.getByText(/\/ 100/)).toBeInTheDocument();
    expect(screen.getByText("density 0.85 ppl/m²")).toBeInTheDocument();
    expect(screen.getByText("IN +12.4/m · OUT −4.2/m")).toBeInTheDocument();
  });

  it("renders autonomous action details when autoAction is provided", () => {
    const autoAction: Intervention = {
      id: "iv-lead-1",
      zone_id: "GATE_A",
      type: "SIGNAGE_REROUTE",
      message: "Autonomous reroute triggered",
      severity: "HIGH",
      applied_at: new Date(Date.now() - 5000).toISOString(),
    };

    render(
      <ZoneLead
        zone={baseZone}
        autoAction={autoAction}
        onOverride={jest.fn()}
        busy={false}
      />
    );

    expect(screen.getByText("AUTO")).toBeInTheDocument();
    expect(screen.getByText("signage reroute")).toBeInTheDocument();
    expect(screen.getByText(/s ago/)).toBeInTheDocument();
  });

  it("renders OP OVERRIDE badge when intervention was manually triggered", () => {
    const manualAction: Intervention = {
      id: "iv-lead-manual",
      zone_id: "GATE_A",
      type: "HOLD_INFLOW",
      message: "MANUAL OVERRIDE: operator forced signage reroute",
      severity: "HIGH",
      applied_at: new Date(Date.now() - 2000).toISOString(),
    };

    render(
      <ZoneLead
        zone={baseZone}
        autoAction={manualAction}
        onOverride={jest.fn()}
        busy={false}
      />
    );

    expect(screen.getByText("OP OVERRIDE")).toBeInTheDocument();
    expect(screen.getByText("hold inflow")).toBeInTheDocument();
  });

  describe("2-step manual override arming flow", () => {
    it("transitions from FORCE REROUTE to CONFIRM REROUTE? on first click and executes on second click", () => {
      const onOverride = jest.fn();
      render(
        <ZoneLead
          zone={baseZone}
          autoAction={null}
          onOverride={onOverride}
          busy={false}
        />
      );

      const button = screen.getByRole("button", { name: /FORCE REROUTE/i });
      expect(button).toHaveAttribute("aria-pressed", "false");

      // First click -> arms the button
      fireEvent.click(button);
      expect(screen.getByRole("button", { name: /CONFIRM REROUTE\?/i })).toBeInTheDocument();
      expect(button).toHaveAttribute("aria-pressed", "true");
      expect(onOverride).not.toHaveBeenCalled();

      // Second click -> executes override
      fireEvent.click(button);
      expect(onOverride).toHaveBeenCalledWith("GATE_A");
      expect(screen.getByRole("button", { name: /FORCE REROUTE/i })).toBeInTheDocument();
      expect(button).toHaveAttribute("aria-pressed", "false");
    });

    it("automatically disarms after 4000ms timeout", () => {
      jest.useFakeTimers();
      const onOverride = jest.fn();

      render(
        <ZoneLead
          zone={baseZone}
          autoAction={null}
          onOverride={onOverride}
          busy={false}
        />
      );

      const button = screen.getByRole("button", { name: /FORCE REROUTE/i });

      // First click
      fireEvent.click(button);
      expect(screen.getByRole("button", { name: /CONFIRM REROUTE\?/i })).toBeInTheDocument();

      // Fast-forward 4000ms
      act(() => {
        jest.advanceTimersByTime(4000);
      });

      expect(screen.getByRole("button", { name: /FORCE REROUTE/i })).toBeInTheDocument();
      expect(button).toHaveAttribute("aria-pressed", "false");
    });

    it("disarms when lead zone changes", () => {
      const { rerender } = render(
        <ZoneLead
          zone={baseZone}
          autoAction={null}
          onOverride={jest.fn()}
          busy={false}
        />
      );

      const button = screen.getByRole("button", { name: /FORCE REROUTE/i });
      fireEvent.click(button);
      expect(screen.getByRole("button", { name: /CONFIRM REROUTE\?/i })).toBeInTheDocument();

      // Rerender with a different zone_id
      const newZone: ZoneMetric = { ...baseZone, zone_id: "GATE_B" };
      rerender(
        <ZoneLead
          zone={newZone}
          autoAction={null}
          onOverride={jest.fn()}
          busy={false}
        />
      );

      expect(screen.getByRole("button", { name: /FORCE REROUTE/i })).toBeInTheDocument();
    });

    it("disables button and ignores clicks when busy is true", () => {
      const onOverride = jest.fn();
      render(
        <ZoneLead
          zone={baseZone}
          autoAction={null}
          onOverride={onOverride}
          busy={true}
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();

      fireEvent.click(button);
      expect(onOverride).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /FORCE REROUTE/i })).toBeInTheDocument();
    });
  });
});
