import React from "react";
import { render, screen } from "@testing-library/react";
import ZoneRow from "@/components/ZoneRow";
import type { ZoneMetric } from "@/lib/types";

describe("components/ZoneRow", () => {
  const nominalZone: ZoneMetric = {
    zone_id: "CONCOURSE_A",
    capacity: 200,
    density: 0.25,
    occupancy: 50,
    congestion: "LOW",
    inflow_rate: 4.2,
    outflow_rate: 3.8,
    timestamp: "2026-08-14T06:00:00Z",
  };

  const highZone: ZoneMetric = {
    zone_id: "GATE_A",
    capacity: 100,
    density: 0.82,
    occupancy: 82,
    congestion: "HIGH",
    inflow_rate: 11.6,
    outflow_rate: 4.1,
    timestamp: "2026-08-14T06:00:00Z",
  };

  const criticalZone: ZoneMetric = {
    zone_id: "BAG_CHECK",
    capacity: 80,
    density: 0.98,
    occupancy: 78,
    congestion: "CRITICAL",
    inflow_rate: 18.0,
    outflow_rate: 2.0,
    timestamp: "2026-08-14T06:00:00Z",
  };

  it("renders nominal zone metrics with nominal styling", () => {
    render(<ZoneRow zone={nominalZone} />);

    expect(screen.getByText("CONCOURSE_A")).toBeInTheDocument();
    expect(screen.getByText("CONCOURSE_A")).toHaveClass("text-slate-200");
    expect(screen.getByText("50")).toBeInTheDocument();
    expect(screen.getByText("/200")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.getByText("LOW")).toBeInTheDocument();
    expect(screen.getByText("+4/−4")).toBeInTheDocument();
  });

  it("renders high zone with attention styling (amber accent)", () => {
    render(<ZoneRow zone={highZone} />);

    expect(screen.getByText("GATE_A")).toBeInTheDocument();
    expect(screen.getByText("GATE_A")).toHaveClass("text-term-amber");
    expect(screen.getByText("82%")).toHaveClass("text-term-amber");
    expect(screen.getByText("HIGH")).toHaveClass("text-term-amber");
    expect(screen.getByText("+12/−4")).toBeInTheDocument();
  });

  it("renders critical zone with attention styling (red accent)", () => {
    render(<ZoneRow zone={criticalZone} />);

    expect(screen.getByText("BAG_CHECK")).toBeInTheDocument();
    expect(screen.getByText("BAG_CHECK")).toHaveClass("text-term-red");
    expect(screen.getByText("98%")).toHaveClass("text-term-red");
    expect(screen.getByText("CRITICAL")).toHaveClass("text-term-red");
    expect(screen.getByText("+18/−2")).toBeInTheDocument();
  });
});
