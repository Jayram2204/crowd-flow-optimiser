import React from "react";
import { render, screen } from "@testing-library/react";
import LandingPage from "@/components/landing/LandingPage";

describe("components/landing/LandingPage", () => {
  it("renders hero headline and thesis copy", () => {
    render(<LandingPage />);

    expect(screen.getByText("WE EXECUTE,")).toBeInTheDocument();
    expect(screen.getByText("WE DON'T JUST")).toBeInTheDocument();
    expect(
      screen.getByText((content, element) => element?.tagName.toLowerCase() === "span" && content.includes("WATCH"))
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A decentralized network of autonomous zone agents/i)
    ).toBeInTheDocument();
  });

  it("renders navigation and call-to-action links to operate view and repo", () => {
    render(<LandingPage />);

    const operateLinks = screen.getAllByRole("link", { name: /WATCH IT WORK/i });
    expect(operateLinks.length).toBeGreaterThanOrEqual(1);
    expect(operateLinks[0]).toHaveAttribute("href", "/operate");

    const repoLinks = screen.getAllByRole("link", { name: /READ THE REPO/i });
    expect(repoLinks.length).toBeGreaterThanOrEqual(1);
    expect(repoLinks[0]).toHaveAttribute(
      "href",
      "https://github.com/Jayram2204/crowd-flow-optimiser"
    );
  });

  it("renders HOW IT WORKS numbered architecture points", () => {
    render(<LandingPage />);

    expect(screen.getByText("HOW IT WORKS — NO CENTRAL POINT OF FAILURE")).toBeInTheDocument();
    expect(screen.getByText("Zone agents, not a simulation")).toBeInTheDocument();
    expect(screen.getByText("Peer negotiation over channels")).toBeInTheDocument();
    expect(screen.getByText("Autonomous signage execution")).toBeInTheDocument();
    expect(screen.getByText("Operator override")).toBeInTheDocument();
  });

  it("renders peer negotiation SVG diagram with animated ping elements", () => {
    const { container } = render(<LandingPage />);

    expect(screen.getByText("GATE_A")).toBeInTheDocument();
    expect(screen.getByText("GATE_B")).toBeInTheDocument();
    expect(screen.getByText("OFFER 36 →")).toBeInTheDocument();
    expect(screen.getByText("ACCEPTED · 42µs")).toBeInTheDocument();

    const pingContainer = container.querySelector(".negotiation-ping");
    expect(pingContainer).toBeInTheDocument();
    // In our jest.setup.ts, IntersectionObserver immediately triggers intersection
    expect(pingContainer).toHaveClass("on");
  });

  it("renders honesty status cards for TODAY and IN PROGRESS", () => {
    render(<LandingPage />);

    expect(screen.getByText("STATUS — WHAT'S REAL TODAY")).toBeInTheDocument();
    expect(screen.getByText("TODAY")).toBeInTheDocument();
    expect(screen.getByText("IN PROGRESS")).toBeInTheDocument();
    expect(
      screen.getByText(/SIMULATED INPUT IS CALLED SIMULATED INPUT/i)
    ).toBeInTheDocument();
  });

  it("renders footer information", () => {
    render(<LandingPage />);

    expect(
      screen.getByText(/MIT LICENSE · BUILD SOMETHING THAT KEEPS PEOPLE MOVING/i)
    ).toBeInTheDocument();
  });
});
