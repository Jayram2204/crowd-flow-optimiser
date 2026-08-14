import React from "react";
import { render, screen } from "@testing-library/react";
import InterventionLog from "@/components/InterventionLog";
import type { Intervention } from "@/lib/types";

describe("components/InterventionLog", () => {
  it("renders empty state when log is empty", () => {
    render(<InterventionLog log={[]} />);

    expect(screen.getByText("AGENT INTERVENTION LOG")).toBeInTheDocument();
    expect(screen.getByText("awaiting physical actions…")).toBeInTheDocument();
  });

  it("renders intervention items with appropriate details and formatting", () => {
    const sampleLog: Intervention[] = [
      {
        id: "iv-1",
        zone_id: "GATE_A",
        type: "SIGNAGE_REROUTE",
        target_zone: "GATE_B",
        message: "Rerouting flow from GATE_A to GATE_B",
        severity: "HIGH",
        applied_at: "2026-08-14T06:00:00Z",
      },
      {
        id: "iv-2",
        zone_id: "BAG_CHECK",
        type: "HOLD_INFLOW",
        message: "Holding passenger intake at bag check",
        severity: "CRITICAL",
        applied_at: "2026-08-14T05:59:00Z",
      },
    ];

    render(<InterventionLog log={sampleLog} />);

    expect(screen.getByText("GATE_A")).toBeInTheDocument();
    expect(screen.getByText("[HIGH]")).toBeInTheDocument();
    expect(screen.getByText("signage reroute")).toBeInTheDocument();
    expect(screen.getByText("→ GATE_B")).toBeInTheDocument();
    expect(screen.getByText("Rerouting flow from GATE_A to GATE_B")).toBeInTheDocument();

    expect(screen.getByText("BAG_CHECK")).toBeInTheDocument();
    expect(screen.getByText("[CRITICAL]")).toBeInTheDocument();
    expect(screen.getByText("hold inflow")).toBeInTheDocument();
  });

  it("applies distinct styling and operator badge for DISPATCH_STAFF", () => {
    const staffLog: Intervention[] = [
      {
        id: "iv-staff",
        zone_id: "SECURITY_T1",
        type: "DISPATCH_STAFF",
        message: "Deploy ground crew to queue head",
        severity: "CRITICAL",
        applied_at: "2026-08-14T06:00:00Z",
      },
    ];

    const { container } = render(<InterventionLog log={staffLog} />);

    expect(screen.getByText("staff dispatch")).toBeInTheDocument();
    expect(screen.getByText("→ awaiting operator")).toBeInTheDocument();

    const li = container.querySelector("li");
    expect(li).toHaveClass("border-dashed");
    expect(li).toHaveClass("border-term-amber/50");
  });

  it("adds log-land animation class to the newest intervention only", () => {
    const sampleLog: Intervention[] = [
      {
        id: "iv-newest",
        zone_id: "GATE_A",
        type: "SIGNAGE_REROUTE",
        message: "First / newest item",
        severity: "HIGH",
        applied_at: "2026-08-14T06:00:00Z",
      },
      {
        id: "iv-older",
        zone_id: "GATE_B",
        type: "SIGNAGE_REROUTE",
        message: "Second item",
        severity: "MODERATE",
        applied_at: "2026-08-14T05:50:00Z",
      },
    ];

    const { container } = render(<InterventionLog log={sampleLog} />);
    const items = container.querySelectorAll("li");

    expect(items[0]).toHaveClass("log-land");
    expect(items[1]).not.toHaveClass("log-land");
  });

  it("caps log at 50 items and renders +N older counter when list exceeds 50", () => {
    const largeLog: Intervention[] = Array.from({ length: 65 }, (_, i) => ({
      id: `iv-${i}`,
      zone_id: `ZONE_${i}`,
      type: "DYNAMIC_SHUTTLE",
      message: `Message ${i}`,
      severity: "LOW",
      applied_at: "2026-08-14T06:00:00Z",
    }));

    const { container } = render(<InterventionLog log={largeLog} />);

    const renderedItems = container.querySelectorAll("li");
    expect(renderedItems.length).toBe(50);
    expect(screen.getByText("+15 older")).toBeInTheDocument();
  });
});
