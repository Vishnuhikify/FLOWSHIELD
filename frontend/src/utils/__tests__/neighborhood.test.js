import { describe, expect, it } from "vitest";
import { buildNeighborhoodLayout, neighborhoodWaterFraction } from "../neighborhood";

describe("buildNeighborhoodLayout", () => {
  it("is deterministic: the same region id always gives the same illustrative layout", () => {
    const a = buildNeighborhoodLayout("R5C3");
    const b = buildNeighborhoodLayout("R5C3");
    expect(a).toEqual(b);
  });
  it("different regions get different (but still fixed) layouts", () => {
    expect(buildNeighborhoodLayout("R5C3")).not.toEqual(buildNeighborhoodLayout("R1C1"));
  });
  it("produces roads, buildings and drainage points, and a low area within the tile", () => {
    const layout = buildNeighborhoodLayout("R4C2");
    expect(layout.roads.length).toBeGreaterThan(0);
    expect(layout.buildings.length).toBeGreaterThan(0);
    expect(layout.drains.length).toBeGreaterThan(0);
    expect(layout.lowArea.cx).toBeGreaterThan(0);
    expect(layout.lowArea.cx).toBeLessThan(100);
  });
});

describe("neighborhoodWaterFraction", () => {
  it("is driven by the existing depth/threshold scale, clamped to 0..1", () => {
    expect(neighborhoodWaterFraction(0, 0.3)).toBe(0);
    expect(neighborhoodWaterFraction(0.45, 0.3)).toBe(1); // depthScaleMax = critical * 1.5
    expect(neighborhoodWaterFraction(0.225, 0.3)).toBeCloseTo(0.5, 5);
    expect(neighborhoodWaterFraction(-1, 0.3)).toBe(0);
  });
});
