import {
  CONGESTION_STYLE,
  INTERVENTION_LABEL,
  pct,
  SEVERITY_COLOR,
  SEVERITY_RANK,
} from "@/components/congestion";
import type { Congestion, InterventionType } from "@/lib/types";

describe("components/congestion", () => {
  describe("pct calculation", () => {
    it("calculates correct rounded percentage for standard values", () => {
      expect(pct(50, 100)).toBe(50);
      expect(pct(1, 3)).toBe(33);
      expect(pct(2, 3)).toBe(67);
      expect(pct(85, 100)).toBe(85);
      expect(pct(0, 50)).toBe(0);
    });

    it("returns 0 when capacity is zero or negative", () => {
      expect(pct(50, 0)).toBe(0);
      expect(pct(50, -10)).toBe(0);
    });

    it("clamps values greater than capacity to 100%", () => {
      expect(pct(120, 100)).toBe(100);
      expect(pct(500, 200)).toBe(100);
    });
  });

  describe("CONGESTION_STYLE map", () => {
    const levels: Congestion[] = ["LOW", "MODERATE", "HIGH", "CRITICAL"];

    it("contains style definitions for all congestion levels", () => {
      levels.forEach((level) => {
        expect(CONGESTION_STYLE[level]).toBeDefined();
        expect(typeof CONGESTION_STYLE[level].text).toBe("string");
        expect(typeof CONGESTION_STYLE[level].bar).toBe("string");
        expect(typeof CONGESTION_STYLE[level].dot).toBe("string");
        expect(typeof CONGESTION_STYLE[level].border).toBe("string");
        expect(typeof CONGESTION_STYLE[level].attention).toBe("boolean");
      });
    });

    it("marks LOW and MODERATE as nominal (attention = false)", () => {
      expect(CONGESTION_STYLE.LOW.attention).toBe(false);
      expect(CONGESTION_STYLE.MODERATE.attention).toBe(false);
      expect(CONGESTION_STYLE.LOW.border).toBe("border-edge");
      expect(CONGESTION_STYLE.MODERATE.border).toBe("border-edge");
    });

    it("marks HIGH and CRITICAL as requiring attention (attention = true)", () => {
      expect(CONGESTION_STYLE.HIGH.attention).toBe(true);
      expect(CONGESTION_STYLE.HIGH.text).toContain("term-amber");
      expect(CONGESTION_STYLE.HIGH.border).toContain("border-term-amber");

      expect(CONGESTION_STYLE.CRITICAL.attention).toBe(true);
      expect(CONGESTION_STYLE.CRITICAL.text).toContain("term-red");
      expect(CONGESTION_STYLE.CRITICAL.border).toContain("border-term-red");
    });
  });

  describe("INTERVENTION_LABEL", () => {
    const types: InterventionType[] = [
      "SIGNAGE_REROUTE",
      "HOLD_INFLOW",
      "DYNAMIC_SHUTTLE",
      "DISPATCH_STAFF",
    ];

    it("maps all intervention types to lowercase monospace sentence labels", () => {
      types.forEach((t) => {
        expect(INTERVENTION_LABEL[t]).toBeDefined();
      });
      expect(INTERVENTION_LABEL.SIGNAGE_REROUTE).toBe("signage reroute");
      expect(INTERVENTION_LABEL.HOLD_INFLOW).toBe("hold inflow");
      expect(INTERVENTION_LABEL.DYNAMIC_SHUTTLE).toBe("dynamic shuttle");
      expect(INTERVENTION_LABEL.DISPATCH_STAFF).toBe("staff dispatch");
    });
  });

  describe("SEVERITY_RANK and SEVERITY_COLOR", () => {
    it("orders severity rank hierarchically from LOW to CRITICAL", () => {
      expect(SEVERITY_RANK.LOW).toBe(0);
      expect(SEVERITY_RANK.MODERATE).toBe(1);
      expect(SEVERITY_RANK.HIGH).toBe(2);
      expect(SEVERITY_RANK.CRITICAL).toBe(3);

      expect(SEVERITY_RANK.CRITICAL).toBeGreaterThan(SEVERITY_RANK.HIGH);
      expect(SEVERITY_RANK.HIGH).toBeGreaterThan(SEVERITY_RANK.MODERATE);
      expect(SEVERITY_RANK.MODERATE).toBeGreaterThan(SEVERITY_RANK.LOW);
    });

    it("provides severity color classes matching terminal theme tokens", () => {
      expect(SEVERITY_COLOR.CRITICAL).toBe("text-term-red");
      expect(SEVERITY_COLOR.HIGH).toBe("text-term-amber");
      expect(SEVERITY_COLOR.MODERATE).toBe("text-term-dim");
      expect(SEVERITY_COLOR.LOW).toBe("text-terminal");
    });
  });
});
