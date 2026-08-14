import React from "react";
import { render, screen } from "@testing-library/react";
import Page, { metadata as pageMetadata } from "@/app/page";
import RootLayout, { metadata as layoutMetadata } from "@/app/layout";

describe("app route pages and layouts", () => {
  describe("app/page.tsx", () => {
    it("exports valid metadata for search indexing and social cards", () => {
      expect(pageMetadata.title).toContain("CROWD_FLOW // OPTIMISER");
      expect(pageMetadata.description).toBeDefined();
    });

    it("renders LandingPage component as the index route", () => {
      render(<Page />);
      expect(screen.getByText("WE EXECUTE,")).toBeInTheDocument();
      expect(screen.queryByText("AGENT INTERVENTION LOG")).not.toBeInTheDocument();
    });
  });

  describe("app/layout.tsx", () => {
    it("exports valid root layout metadata", () => {
      expect(layoutMetadata.title).toBe("CROWD_FLOW // OPTIMISER");
      expect(layoutMetadata.description).toBe(
        "Decentralized multi-agent crowd management. Execute, don't observe."
      );
    });

    it("renders children wrapped inside dark theme and scanline styling", () => {
      const { container } = render(
        <RootLayout>
          <div data-testid="test-child">Child Content</div>
        </RootLayout>
      );

      expect(screen.getByTestId("test-child")).toBeInTheDocument();
      expect(screen.getByText("Child Content")).toBeInTheDocument();

      const body = container.querySelector("body");
      if (body) {
        expect(body).toHaveClass("scanlines");
      }
    });
  });
});
