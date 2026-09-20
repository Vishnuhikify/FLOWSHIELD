import { describe, expect, it } from "vitest";
import { alertsAt, buildWarningIndex, cityOutlook, LEAD, nowVsForecast, regionGroups, relativeTime, urgencyTier } from "../earlyWarning";

// /api/simulate-shaped fixture: 1x4 city, 9 timesteps of 5 min (0..40). Thresholds 0.15 / 0.30.
//   A: warning at 10, critical at 20          B: warning at 25, critical at 40
//   C: warning at 30, never critical, then recedes to safe at 40      D: always safe
const T = [0, 5, 10, 15, 20, 25, 30, 35, 40];
const depth = {
  A: [0.0, 0.1, 0.16, 0.25, 0.31, 0.35, 0.38, 0.4, 0.41],
  B: [0.0, 0.02, 0.05, 0.08, 0.11, 0.17, 0.22, 0.27, 0.3],
  C: [0.0, 0.01, 0.03, 0.06, 0.09, 0.12, 0.16, 0.18, 0.14],
  D: [0, 0, 0, 0, 0, 0, 0, 0, 0],
};
const ids = ["A", "B", "C", "D"];
const pops = { A: 300, B: 1000, C: 50, D: 7 };
const risk = (d) => (d >= 0.3 ? "CRITICAL" : d >= 0.15 ? "WARNING" : "SAFE");
const count = (k, level) => ids.filter((id) => risk(depth[id][k]) === level).length;
const pop = (k, level) => ids.filter((id) => risk(depth[id][k]) === level).reduce((n, id) => n + pops[id], 0);

const data = {
  regions: ids.map((id, col) => {
    const peak = Math.max(...depth[id]);
    const c = depth[id].findIndex((d) => d >= 0.3);
    return { id, row: 0, col, population: pops[id], peak_risk: risk(peak), max_water_level: peak, time_to_critical: c < 0 ? null : T[c] };
  }),
  summary: { critical_region_count: 2, warning_region_count: 1, critical_population: 1300, warning_population: 50, affected_population: 1350, total_population: 1357 },
  timeline: {
    timestamps: T,
    water_levels: T.map((_, k) => [ids.map((id) => depth[id][k])]),
    risk_levels: T.map((_, k) => [ids.map((id) => risk(depth[id][k]))]),
    critical_region_count: T.map((_, k) => count(k, "CRITICAL")),
    warning_region_count: T.map((_, k) => count(k, "WARNING")),
    critical_population: T.map((_, k) => pop(k, "CRITICAL")),
    warning_population: T.map((_, k) => pop(k, "WARNING")),
    affected_population: T.map((_, k) => pop(k, "CRITICAL") + pop(k, "WARNING")),
  },
};
const index = buildWarningIndex(data);
const at = (minutes) => alertsAt(data, index, T.indexOf(minutes));
const byId = (list, id) => list.find((a) => a.id === id);

describe("buildWarningIndex (forecast facts, fixed for the run)", () => {
  it("only includes regions that leave SAFE", () => expect(index.map((e) => e.id)).toEqual(["A", "B", "C"]));
  it("finds first warning, critical time, lead time and peak", () => {
    expect(byId(index, "A")).toMatchObject({ firstWarningTime: 10, firstWarningStep: 2, criticalAt: 20, criticalStep: 4, leadMinutes: 10, peakTime: 40 });
    expect(byId(index, "B")).toMatchObject({ firstWarningTime: 25, criticalAt: 40, leadMinutes: 15 });
  });
  it("never invents a critical time", () => {
    expect(byId(index, "C")).toMatchObject({ firstWarningTime: 30, criticalAt: null, criticalStep: null, leadMinutes: null, peakTime: 35 });
  });
});

describe("urgencyTier", () => {
  it("bands by minutes to critical", () => {
    expect(urgencyTier("CRITICAL", -5, -20)).toBe("critical");
    expect(urgencyTier("WARNING", LEAD.imminent, -5)).toBe("imminent");
    expect(urgencyTier("SAFE", LEAD.imminent + 1, 5)).toBe("soon");
    expect(urgencyTier("WARNING", LEAD.soon + 1, -5)).toBe("warning");
    expect(urgencyTier("SAFE", LEAD.soon + 1, 12)).toBe("watch");
    expect(urgencyTier("SAFE", null, 12)).toBe("watch");
    expect(urgencyTier("WARNING", null, -5)).toBe("warning");
    expect(urgencyTier("SAFE", null, -10)).toBe("eased");
  });
});

describe("alertsAt (the forecast seen from one timestep)", () => {
  it("at the start everything is still ahead", () => {
    const a = at(0);
    expect(byId(a, "A")).toMatchObject({ tier: "soon", minutesToCritical: 20, minutesToWarning: 10 });
    expect(byId(a, "A").now.risk).toBe("SAFE");
    expect(byId(a, "B")).toMatchObject({ tier: "watch", minutesToCritical: 40 });
    expect(byId(a, "C")).toMatchObject({ tier: "watch", minutesToCritical: null, minutesToWarning: 30 });
  });
  it("countdowns shrink as the timeline advances", () => {
    expect(byId(at(10), "A")).toMatchObject({ tier: "imminent", minutesToCritical: 10 });
    expect(byId(at(15), "A")).toMatchObject({ tier: "imminent", minutesToCritical: 5 });
    expect(byId(at(20), "A")).toMatchObject({ tier: "critical", minutesToCritical: 0 });
    expect(byId(at(30), "A").minutesToCritical).toBe(-10);
  });
  it("sorts most urgent first", () => {
    expect(at(30).map((a) => [a.id, a.tier])).toEqual([["A", "critical"], ["B", "imminent"], ["C", "warning"]]);
  });
  it("marks a region that has receded as eased", () => {
    expect(byId(at(40), "C")).toMatchObject({ tier: "eased" });
    expect(byId(at(40), "C").now.risk).toBe("SAFE");
  });
  it("within a tier, the sooner warning ranks first", () => {
    const soonerC = { ...data, regions: data.regions.map((r) => (r.id === "B" ? { ...r, time_to_critical: null } : r)) };
    const idx = buildWarningIndex(soonerC); // B: warning at 25, C: warning at 30, neither critical
    expect(alertsAt(soonerC, idx, 0).filter((a) => a.tier === "watch").map((a) => a.id)).toEqual(["B", "C"]);
  });
  it("breaks remaining ties by population", () => {
    const twin = { ...data, regions: data.regions.map((r) => (r.id === "C" ? { ...r, population: 5000 } : r)) };
    const twinIndex = buildWarningIndex(twin).map((e) => ({ ...e, criticalAt: null, firstWarningTime: 30 }));
    const order = alertsAt(twin, twinIndex, 0).filter((a) => a.tier === "watch").map((a) => a.id);
    expect(order).toEqual(["C", "B", "A"]);
  });
});

describe("regionGroups", () => {
  it("separates current regions from forecast-critical regions", () => {
    const g = regionGroups(at(25));
    expect(g.criticalNow.map((a) => a.id)).toEqual(["A"]);
    expect(g.warningNow.map((a) => a.id)).toEqual(["B"]);
    expect(g.forecastCritical.map((a) => [a.id, a.criticalAt])).toEqual([["A", 20], ["B", 40]]);
  });
  it("forecast list does not change with the timestep", () => {
    expect(regionGroups(at(0)).forecastCritical.map((a) => a.id)).toEqual(regionGroups(at(40)).forecastCritical.map((a) => a.id));
    expect(regionGroups(at(0)).criticalNow).toEqual([]);
  });
});

describe("nowVsForecast", () => {
  it("now moves, forecast stays", () => {
    expect(nowVsForecast(data, 0).affectedPeople).toEqual({ now: 0, forecast: 1350 });
    expect(nowVsForecast(data, T.indexOf(25))).toMatchObject({
      affectedPeople: { now: 1300, forecast: 1350 },
      criticalPeople: { now: 300, forecast: 1300 },
      warningPeople: { now: 1000, forecast: 50 },
      criticalRegions: { now: 1, forecast: 2 },
      warningRegions: { now: 1, forecast: 1 },
    });
  });
});

describe("cityOutlook", () => {
  const outlook = (m) => cityOutlook(data, at(m), T.indexOf(m));
  it("reports first warning and first critical with signed countdowns", () => {
    expect(outlook(0).firstWarning).toEqual({ step: 2, time: 10, minutesAway: 10 });
    expect(outlook(0).firstCritical).toEqual({ step: 4, time: 20, minutesAway: 20 });
    expect(outlook(30).firstCritical.minutesAway).toBe(-10);
  });
  it("escalates the level with the timeline", () => {
    expect([0, 10, 20].map((m) => outlook(m).level)).toEqual(["soon", "imminent", "critical"]);
  });
  it("keeps current state and forecast in separate sentences", () => {
    const o = outlook(10);
    expect(o.current).toBe("1 region at warning, none critical.");
    expect(o.forecast).toBe("Under this simulation, A turns critical in 10 min, followed by 1 more region.");
    expect(outlook(40).current).toBe("2 regions critical.");
    expect(outlook(40).forecast).toMatch(/no further region turns critical/);
  });
  it("handles a run that stays safe", () => {
    const calm = {
      ...data,
      regions: data.regions.map((r) => ({ ...r, peak_risk: "SAFE", time_to_critical: null })),
      summary: { ...data.summary, critical_region_count: 0 },
      timeline: { ...data.timeline, critical_region_count: T.map(() => 0), warning_region_count: T.map(() => 0) },
    };
    const o = cityOutlook(calm, alertsAt(calm, buildWarningIndex(calm), 3), 3);
    expect(o).toMatchObject({ level: "clear", firstWarning: null, firstCritical: null, nextCritical: null });
    expect(o.forecast).toMatch(/stays below the warning depth/);
  });
  it("handles a warning-only run", () => {
    const mild = { ...data, regions: data.regions.filter((r) => r.id === "C" || r.id === "D"), summary: { ...data.summary, critical_region_count: 0 } };
    mild.timeline = { ...data.timeline, critical_region_count: T.map(() => 0) };
    const o = cityOutlook(mild, alertsAt(mild, buildWarningIndex(mild), 0), 0);
    expect(o.level).toBe("watch");
    expect(o.forecast).toBe("Under this simulation, C reaches warning in 30 min. No region is forecast to turn critical in this run.");
  });
});

describe("relativeTime", () => {
  it("formats signed minutes", () => {
    expect(relativeTime(7)).toBe("in 7 min");
    expect(relativeTime(0)).toBe("now");
    expect(relativeTime(-12.5)).toBe("12.5 min ago");
    expect(relativeTime(null)).toBe("");
  });
});
