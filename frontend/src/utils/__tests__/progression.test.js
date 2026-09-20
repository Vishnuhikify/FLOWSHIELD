import { describe, expect, it } from "vitest";
import { bandGradient, deepestRegionAt, frameAt, milestones, regionStateAt, riskBandSegments, stepForTime } from "../progression";

// A tiny hand-made response in the exact /api/simulate shape: 1x2 city, 5 timesteps of 0.5 min.
// Thresholds 0.15 / 0.30. Region A floods; region B stays dry.
const depthA = [0.0, 0.1, 0.2, 0.32, 0.31];
const risk = (d) => (d >= 0.3 ? "CRITICAL" : d >= 0.15 ? "WARNING" : "SAFE");
const data = {
  city: { region_ids: [["A", "B"]] },
  regions: [
    { id: "A", row: 0, col: 0, population: 100, time_to_critical: 1.5, max_water_level: 0.32 },
    { id: "B", row: 0, col: 1, population: 40, time_to_critical: null, max_water_level: 0 },
  ],
  timeline: {
    timestamps: [0, 0.5, 1, 1.5, 2],
    water_levels: depthA.map((d) => [[d, 0]]),
    risk_levels: depthA.map((d) => [[risk(d), "SAFE"]]),
    max_water: depthA,
    safe_region_count: [2, 2, 1, 1, 1],
    warning_region_count: [0, 0, 1, 0, 0],
    critical_region_count: [0, 0, 0, 1, 1],
    warning_population: [0, 0, 100, 0, 0],
    critical_population: [0, 0, 0, 100, 100],
    affected_population: [0, 0, 100, 100, 100],
  },
};

describe("frameAt", () => {
  it("reads the current counts and population for the chosen timestep", () => {
    expect(frameAt(data, 2)).toMatchObject({
      step: 2, time: 1, critical: 0, warning: 1, safe: 1, warningPopulation: 100, criticalPopulation: 0, maxWater: 0.2, isStart: false, isFinal: false,
    });
    expect(frameAt(data, 3)).toMatchObject({ time: 1.5, critical: 1, warning: 0, criticalPopulation: 100 });
  });
  it("flags the start and the end, and clamps out-of-range steps", () => {
    expect(frameAt(data, 0)).toMatchObject({ isStart: true, isFinal: false, time: 0 });
    expect(frameAt(data, 99)).toMatchObject({ step: 4, isFinal: true, time: 2, endTime: 2 });
    expect(frameAt(data, -3).step).toBe(0);
  });
  it("counts always cover every region", () => {
    data.timeline.timestamps.forEach((_, i) => {
      const f = frameAt(data, i);
      expect(f.critical + f.warning + f.safe).toBe(2);
    });
  });
});

describe("regionStateAt", () => {
  const [A, B] = data.regions;
  it("updates depth and risk with the timestep", () => {
    expect(regionStateAt(data, A, 1)).toMatchObject({ depth: 0.1, risk: "SAFE" });
    expect(regionStateAt(data, A, 2)).toMatchObject({ depth: 0.2, risk: "WARNING" });
    expect(regionStateAt(data, A, 3)).toMatchObject({ depth: 0.32, risk: "CRITICAL" });
  });
  it("uses the real timestep length for the rate of change", () => {
    expect(regionStateAt(data, A, 2).changePerMin).toBeCloseTo(0.2); // 0.1 m in 0.5 min
    expect(regionStateAt(data, A, 2).trend).toBe("rising");
    expect(regionStateAt(data, A, 4).trend).toBe("falling");
    expect(regionStateAt(data, A, 0)).toMatchObject({ changePerMin: 0, trend: "steady" });
  });
  it("separates current state from the forecast", () => {
    expect(regionStateAt(data, A, 1)).toMatchObject({ risk: "SAFE", outlook: "upcoming", minutesToCritical: 1, criticalAt: 1.5 });
    expect(regionStateAt(data, A, 3)).toMatchObject({ outlook: "reached", minutesToCritical: 0 });
    expect(regionStateAt(data, A, 4).minutesToCritical).toBe(-0.5);
    expect(regionStateAt(data, B, 4)).toMatchObject({ outlook: "never", minutesToCritical: null, criticalAt: null });
  });
});

describe("timeline helpers", () => {
  it("finds the first warning and first critical timesteps", () => {
    expect(milestones(data.timeline)).toEqual({ firstWarningStep: 2, firstCriticalStep: 3 });
  });
  it("returns null milestones for a run that stays safe", () => {
    const calm = { ...data.timeline, warning_region_count: [0, 0, 0, 0, 0], critical_region_count: [0, 0, 0, 0, 0] };
    expect(milestones(calm)).toEqual({ firstWarningStep: null, firstCriticalStep: null });
    expect(riskBandSegments(calm)).toEqual([{ level: "SAFE", fromStep: 0, toStep: 4, from: 0, to: 1 }]);
  });
  it("run-length encodes the worst city-wide level", () => {
    const segs = riskBandSegments(data.timeline);
    expect(segs.map((s) => [s.level, s.fromStep, s.toStep])).toEqual([["SAFE", 0, 1], ["WARNING", 2, 2], ["CRITICAL", 3, 4]]);
    expect(segs[0].from).toBe(0);
    expect(segs[2].to).toBe(1);
    expect(segs[0].to).toBeCloseTo(segs[1].from); // no gaps
    expect(bandGradient(segs, { SAFE: "g", WARNING: "a", CRITICAL: "r" })).toMatch(/^linear-gradient\(to right, g 0\.000%.*r 100\.000%\)$/);
  });
  it("finds the deepest region, or null when dry", () => {
    expect(deepestRegionAt(data, 3)).toBe("A");
    expect(deepestRegionAt(data, 0)).toBeNull();
  });
  it("maps a time to the nearest timestep", () => {
    expect(stepForTime(data.timeline.timestamps, 1.5)).toBe(3);
    expect(stepForTime(data.timeline.timestamps, 1.3)).toBe(3);
    expect(stepForTime(data.timeline.timestamps, 100)).toBe(4);
  });
});
