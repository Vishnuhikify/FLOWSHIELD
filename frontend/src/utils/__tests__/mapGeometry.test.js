import { describe, expect, it } from "vitest";
import { cellColors } from "../colors";
import { areaBounds, DEFAULT_LAYOUT, DEMO_AREA, DEMO_CENTER, MAP_DISCLAIMER, LAYOUTS, mapRegions, OSM_ATTRIBUTION, OSM_TILES, regionBounds, regionStyle, showMapLabels } from "../mapGeometry";
import { RISK } from "../risk";

// /api/simulate-shaped fixture: 2x2 city, two timesteps.
const data = {
  meta: { rows: 2, cols: 2 },
  regions: [
    { id: "R1C1", row: 0, col: 0, elevation: 10.5 }, { id: "R1C2", row: 0, col: 1, elevation: 10.2 },
    { id: "R2C1", row: 1, col: 0, elevation: 10.1 }, { id: "R2C2", row: 1, col: 1, elevation: 9.8 },
  ],
  timeline: {
    water_levels: [[[0, 0], [0.02, 0.05]], [[0.001, 0.04], [0.18, 0.34]]],
    risk_levels: [[["SAFE", "SAFE"], ["SAFE", "SAFE"]], [["SAFE", "SAFE"], ["WARNING", "CRITICAL"]]],
  },
};
const ctx = { critical: 0.3, minElev: 9.8, maxElev: 10.5 };
const byId = (list, id) => list.find((r) => r.id === id);

describe("layout toggle", () => {
  it("offers grid and map, and grid stays the default", () => {
    expect(LAYOUTS.map((l) => l.value)).toEqual(["grid", "map"]);
    expect(DEFAULT_LAYOUT).toBe("grid");
  });
  it("uses OpenStreetMap tiles with visible attribution text", () => {
    expect(OSM_TILES).toBe("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png");
    expect(OSM_ATTRIBUTION).toContain("OpenStreetMap</a> contributors");
    expect(OSM_ATTRIBUTION).toContain("&copy;");
  });
});

describe("regionBounds", () => {
  it("tiles the fixed demo area exactly, row 0 in the north", () => {
    const [[s, w], [n, e]] = regionBounds(0, 0, 5, 5);
    expect(n).toBeCloseTo(DEMO_AREA.north);
    expect(w).toBeCloseTo(DEMO_AREA.west);
    expect(n - s).toBeCloseTo((DEMO_AREA.north - DEMO_AREA.south) / 5);
    expect(e - w).toBeCloseTo((DEMO_AREA.east - DEMO_AREA.west) / 5);
    const last = regionBounds(4, 4, 5, 5);
    expect(last[0][0]).toBeCloseTo(DEMO_AREA.south);
    expect(last[1][1]).toBeCloseTo(DEMO_AREA.east);
  });
  it("neighbours share an edge with no gap or overlap", () => {
    expect(regionBounds(0, 0, 5, 5)[1][1]).toBeCloseTo(regionBounds(0, 1, 5, 5)[0][1]);   // east edge = next west edge
    expect(regionBounds(0, 0, 5, 5)[0][0]).toBeCloseTo(regionBounds(1, 0, 5, 5)[1][0]);   // south edge = next north edge
  });
  it("works for any grid size, including 1x1 and large cities", () => {
    expect(regionBounds(0, 0, 1, 1)).toEqual(areaBounds());
    const cell = regionBounds(39, 39, 40, 40);
    expect(cell[0][0]).toBeCloseTo(DEMO_AREA.south);
    expect(cell[1][0] - cell[0][0]).toBeCloseTo((DEMO_AREA.north - DEMO_AREA.south) / 40);
  });
  it("is a fixed area, not derived from the user's location", () => {
    expect(areaBounds()).toEqual([[12.949, 77.5716], [12.994, 77.6176]]);
  });
  it("is centred on Bengaluru and roughly square on the ground", () => {
    expect(DEMO_CENTER[0]).toBeCloseTo(12.9715, 4);
    expect(DEMO_CENTER[1]).toBeCloseTo(77.5946, 4);
    expect(DEMO_AREA.name).toContain("Bengaluru");
    const km = { ns: (DEMO_AREA.north - DEMO_AREA.south) * 111.32, ew: (DEMO_AREA.east - DEMO_AREA.west) * 111.32 * Math.cos((DEMO_CENTER[0] * Math.PI) / 180) };
    expect(km.ns).toBeCloseTo(5, 0);
    expect(km.ew).toBeCloseTo(5, 0);
  });
  it("carries the required disclaimer and makes no claim about the real city", () => {
    expect(MAP_DISCLAIMER).toBe("Illustrative simulation \u2014 not real flood risk.");
    expect(DEMO_AREA.name).not.toMatch(/forecast|prediction|risk/i);
  });
});

describe("mapRegions shows the same data as the grid", () => {
  it("uses the water depth and risk of the current timestep", () => {
    const t0 = mapRegions(data, 0, "depth", null, null, ctx);
    const t1 = mapRegions(data, 1, "depth", null, null, ctx);
    expect(t0.map((r) => r.risk)).toEqual(["SAFE", "SAFE", "SAFE", "SAFE"]);
    expect(byId(t1, "R2C2")).toMatchObject({ depth: 0.34, risk: "CRITICAL", label: "34 cm" });
    expect(byId(t1, "R2C1")).toMatchObject({ depth: 0.18, risk: "WARNING", label: "18 cm" });
    expect(byId(t1, "R1C1").label).toBe("<1 cm");
    expect(byId(t0, "R2C2").style.fillColor).not.toBe(byId(t1, "R2C2").style.fillColor);
  });
  it("fills with exactly the grid cell's colour in every view", () => {
    for (const view of ["depth", "risk", "terrain"]) {
      const r = byId(mapRegions(data, 1, view, null, null, ctx), "R2C2");
      expect(r.style.fillColor).toBe(cellColors(view, 0.34, "CRITICAL", 9.8, ctx).background);
    }
    expect(byId(mapRegions(data, 1, "terrain", null, null, ctx), "R1C1").label).toBe("10.5 m");
  });
  it("frames warning and critical regions in the FLOWSHIELD risk colours", () => {
    const t1 = mapRegions(data, 1, "depth", null, null, ctx);
    expect(byId(t1, "R2C2").style).toMatchObject({ color: RISK.CRITICAL.hex, weight: 4 });
    expect(byId(t1, "R2C1").style).toMatchObject({ color: RISK.WARNING.hex, weight: 3 });
    expect(byId(t1, "R1C1").style.weight).toBe(1);
    expect(byId(mapRegions(data, 1, "risk", null, null, ctx), "R2C2").style.fillColor).toBe(RISK.CRITICAL.fill);
  });
  it("marks the selected region, and only that one", () => {
    const regions = mapRegions(data, 1, "depth", "R2C1", null, ctx);
    expect(regions.filter((r) => r.selected).map((r) => r.id)).toEqual(["R2C1"]);
    expect(byId(regions, "R2C1").style).toMatchObject({ color: "#10273d", weight: 5 });
    expect(mapRegions(data, 1, "depth", null, null, ctx).some((r) => r.selected)).toBe(false);
  });
  it("marks regions changed by an intervention", () => {
    const regions = mapRegions(data, 0, "depth", null, new Set(["R1C2"]), ctx);
    expect(byId(regions, "R1C2")).toMatchObject({ marked: true });
    expect(byId(regions, "R1C2").style).toMatchObject({ color: RISK.SAFE.hex, dashArray: "6 4" });
    expect(byId(regions, "R1C2").description).toContain("drain changed by an intervention");
    expect(byId(regions, "R1C1").style.dashArray).toBeUndefined();
  });
  it("places each region at its grid position and keeps its id for selection", () => {
    const regions = mapRegions(data, 0, "depth", null, null, ctx);
    expect(regions.map((r) => r.id)).toEqual(["R1C1", "R1C2", "R2C1", "R2C2"]);
    expect(byId(regions, "R2C2").bounds).toEqual(regionBounds(1, 1, 2, 2));
    expect(byId(regions, "R2C2").description).toBe("Region R2C2: 5 cm of water, safe");
  });
});

describe("regionStyle and labels", () => {
  it("dry cells are nearly transparent so the street map stays readable", () => {
    expect(regionStyle("depth", 0, "SAFE", 10, ctx, false, false).fillOpacity).toBeLessThan(0.3);
    expect(regionStyle("depth", 0.2, "WARNING", 10, ctx, false, false).fillOpacity).toBeGreaterThan(0.6);
  });
  it("selection wins over the risk frame", () => {
    expect(regionStyle("depth", 0.4, "CRITICAL", 10, ctx, true, true)).toMatchObject({ color: "#10273d", weight: 5, dashArray: undefined });
  });
  it("labels only while readable", () => {
    expect(showMapLabels(5, 5)).toBe(true);
    expect(showMapLabels(40, 40)).toBe(false);
  });
});
