import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ComparisonCards from "../../components/ComparisonCards";
import ComparisonDashboard from "../../components/ComparisonDashboard";
import RegionChangeMap from "../../components/RegionChangeMap";
import RegionComparisonTable from "../../components/RegionComparisonTable";
import { barShares, chartRows, depthChangeCm, filterRegions, formatChange, formatMetricValue, headline, metricsByKey, sortRegions, statusGrid, timeChangeText, timePair } from "../comparison";
import real from "./fixtures/compare.json"; // a real POST /api/compare response (blocked channel, pump + restore channel)

const clone = (x) => JSON.parse(JSON.stringify(x));
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const dashboard = (comparison, props = {}) =>
  text(<ComparisonDashboard comparison={comparison} status="success" error={null} stale={false} canCompare onCompare={() => {}} interventionCatalog={null} selectedId={null} onSelect={() => {}} {...props} />);
const metric = (over) => ({ key: "critical_regions", label: "Critical regions", unit: "regions", lower_is_better: true, without: 2, with: 1, absolute_change: -1, percent_change: -50, percent_note: "", direction: "improved", note: "", ...over });

describe("metric formatting", () => {
  it("formats values by unit", () => {
    expect(formatMetricValue(metric(), 2)).toBe("2");
    expect(formatMetricValue(metric({ unit: "people" }), 10700)).toBe("10,700");
    expect(formatMetricValue(metric({ unit: "m" }), 0.39779)).toBe("0.40 m");
    expect(formatMetricValue(metric({ key: "total_drained" }), 0.5, 25)).toBe("20.0 mm");
  });
  it("shows absolute and percentage change with explicit signs", () => {
    expect(formatChange(metric())).toBe("\u22121 (\u221250.0%)");
    expect(formatChange(metric({ unit: "m", absolute_change: 0.0312, percent_change: 8.2, direction: "worsened" }))).toBe("+0.03 m (+8.2%)");
  });
  it("omits the percentage when the value without the plan was 0", () => {
    expect(formatChange(metric({ without: 0, with: 2, absolute_change: 2, percent_change: null, direction: "worsened" }))).toBe("+2 (no percentage: was 0)");
  });
  it("says no change instead of +0", () => {
    expect(formatChange(metric({ with: 2, absolute_change: 0, percent_change: 0, direction: "unchanged" }))).toBe("No change");
  });
  it("bar shares never divide by zero", () => {
    expect(barShares(metric())).toEqual({ without: 100, with: 50 });
    expect(barShares(metric({ without: 0, with: 0 }))).toEqual({ without: 0, with: 0 });
    expect(barShares(metric({ without: 0, with: 3 }))).toEqual({ without: 0, with: 100 });
  });
});

describe("time comparisons with never-critical values", () => {
  it.each([
    [{ status: "prevented", without: 54, with: null }, "Critical flooding not reached with the plan", "54 min", "not reached"],
    [{ status: "introduced", without: null, with: 40 }, "Turns critical at 40 min with the plan", "not reached", "40 min"],
    [{ status: "delayed", without: 31, with: 38, change_minutes: 7 }, "Delayed by 7 min", "31 min", "38 min"],
    [{ status: "earlier", without: 31, with: 25.5, change_minutes: -5.5 }, "5.5 min earlier", "31 min", "25.5 min"],
    [{ status: "same", without: 31, with: 31, change_minutes: 0 }, "Same time", "31 min", "31 min"],
    [{ status: "never", without: null, with: null }, "Not critical in either run", "not reached", "not reached"],
  ])("%o", (t, words, a, b) => {
    expect(timeChangeText(t)).toBe(words);
    expect(timePair(t)).toEqual({ without: a, with: b });
  });
});

describe("headline stays balanced", () => {
  const withSummary = (s) => ({ region_summary: { improved_count: 0, unchanged_count: 25, worsened_count: 0, ...s } });
  it("improvement carries a caveat", () => {
    const h = headline(real);
    expect(h.tone).toBe("improved");
    expect(h.text).toBe("Under this simulation, with the plan 9 regions improve, 16 stay the same, 0 worsen. An improvement in the model is not a guarantee of the same effect in a real flood.");
  });
  it("worsening is called out", () => {
    expect(headline(withSummary({ improved_count: 3, unchanged_count: 20, worsened_count: 2 }))).toMatchObject({ tone: "mixed" });
    expect(headline(withSummary({ improved_count: 3, unchanged_count: 20, worsened_count: 2 })).text).toMatch(/Check the worsened regions/);
    expect(headline(withSummary({ unchanged_count: 24, worsened_count: 1 }))).toMatchObject({ tone: "worsened" });
  });
  it("a plan with no effect says so", () => {
    expect(headline(withSummary({}))).toMatchObject({ tone: "unchanged" });
    expect(headline(withSummary({})).text).toMatch(/changes no modeled outcome/);
  });
});

describe("region helpers", () => {
  it("filters and sorts: worsened first, then improved by size of change", () => {
    expect(filterRegions(real.regions, "changed")).toHaveLength(9);
    expect(filterRegions(real.regions, "worsened")).toHaveLength(0);
    expect(filterRegions(real.regions, "all")).toHaveLength(25);
    const regions = [{ id: "a", status: "improved", max_water_change: -0.01, row: 0, col: 0 }, { id: "b", status: "unchanged", max_water_change: 0, row: 0, col: 1 },
      { id: "c", status: "worsened", max_water_change: 0.001, row: 0, col: 2 }, { id: "d", status: "improved", max_water_change: -0.2, row: 0, col: 3 }];
    expect(sortRegions(regions).map((r) => r.id)).toEqual(["c", "d", "a", "b"]);
    expect(regions.map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
  });
  it("builds the status grid and chart rows from the response", () => {
    const grid = statusGrid(real);
    expect(grid).toHaveLength(5);
    expect(grid[4][2].id).toBe("R5C3");
    const rows = chartRows(real.timeline, "max_water");
    expect(rows).toHaveLength(61);
    expect(rows[60]).toEqual({ t: 60, without: real.timeline.without.max_water[60], with: real.timeline.with.max_water[60] });
    expect(depthChangeCm(-0.03487)).toBe("\u22123.5 cm");
    expect(depthChangeCm(0)).toBe("0.0 cm");
  });
});

describe("rendering the real /api/compare response", () => {
  const html = dashboard(real);
  it("labels the whole section and keeps the disclaimers", () => {
    expect(html).toContain("MODELED IMPACT");
    expect(html).toContain(real.label);
    expect(html).toContain(real.meta.disclaimer);
    expect(html).toContain("Scenario: Blocked drainage channel, without and with 2 interventions");
  });
  it("shows every required metric side by side with the response's numbers", () => {
    const m = metricsByKey(real);
    ["Critical regions", "Warning regions", "People affected", "People in critical regions", "Maximum water level", "Earliest critical time", "Water removed, average per region"].forEach((label) => expect(html).toContain(label));
    expect(html).toContain("Without plan");
    expect(html).toContain("With plan");
    expect(html).toContain("10,700");
    expect(html).toContain(formatMetricValue(m.affected_population, m.affected_population.with));
    expect(html).toContain(formatChange(m.affected_population));
    expect(html).toContain("Delayed by 7 min");
  });
  it("shows the critical-to-warning note instead of calling warning 'worse'", () => {
    expect(html).toContain("moved down from critical to warning");
  });
  it("lists region outcomes and time-to-critical changes", () => {
    expect(html).toContain("9 improved");
    expect(html).toContain("16 unchanged");
    expect(html).toContain("0 worsened");
    expect(html).toContain("No longer critical with the plan (1)");
    expect(html).toContain("Newly critical with the plan (0)");
    expect(html).toContain("Critical flooding not reached with the plan");
    expect(html).toContain("lower peak risk level");
  });
  it("summarises the shared scenario and the plan with its real input changes", () => {
    expect(html).toContain("Both runs share");
    expect(html).toContain("Only the second run adds");
    expect(html).toContain("R5C3 drain capacity 0 to 120 mm/h");
  });
  it("region table defaults to changed regions only", () => {
    const table = text(<RegionComparisonTable comparison={real} selectedId={null} onSelect={() => {}} />);
    expect(table).toContain("Changed (9)");
    expect(table).toContain("All regions (25)");
    expect(table).toContain("R4C3");
    expect(table).not.toContain("R1C1");
  });
});

describe("rendering edge cases", () => {
  it("before any comparison: explains itself and needs a plan", () => {
    const html = dashboard(null, { status: "idle", canCompare: false });
    expect(html).toContain("MODELED IMPACT");
    expect(html).toContain("Add at least one intervention to the plan to compare.");
    expect(html).toContain("Compare without and with the plan");
  });
  it("API error before any comparison", () => {
    const error = { message: "Request body is not valid", details: [{ field: "interventions.0.targets", message: "needs a target" }] };
    expect(dashboard(null, { status: "error", error })).toContain("Comparison not run. Request body is not valid (interventions.0.targets: needs a target)");
  });
  it("stale comparison asks to compare again and keeps the old numbers visible", () => {
    const html = dashboard(real, { stale: true });
    expect(html).toContain("changed since this comparison was made");
    expect(html).toContain("10,700");
  });
  it("a plan that changes nothing", () => {
    const c = clone(real);
    c.metrics.forEach((m) => Object.assign(m, { with: m.without, absolute_change: 0, percent_change: 0, direction: "unchanged", note: "" }));
    c.regions.forEach((r) => Object.assign(r, { status: "unchanged", reason: "", max_water_change: 0 }));
    Object.assign(c.region_summary, { improved_count: 0, unchanged_count: 25, worsened_count: 0, improved: [], no_longer_critical: [], no_longer_at_risk: [], improved_population: 0 });
    c.time_to_critical = [];
    c.earliest_critical = { ...c.earliest_critical, with: c.earliest_critical.without, change_minutes: 0, status: "same", direction: "unchanged" };
    const html = dashboard(c);
    expect(html).toContain("changes no modeled outcome");
    expect(html).toContain("Same time");
    expect(html).toContain("No regions in this group for this comparison.");
    const cards = text(<ComparisonCards comparison={c} />);
    expect(cards).not.toContain("Improved");
    expect(cards).not.toContain("Worsened");
    expect(cards).toContain("No change");
  });
  it("worsened regions and newly critical regions are shown as prominently as improvements", () => {
    const c = clone(real);
    const r = c.regions.find((x) => x.id === "R2C2");
    Object.assign(r, { status: "worsened", reason: "higher peak water", max_water_change: 0.04, max_water_percent_change: null });
    Object.assign(c.region_summary, { worsened_count: 1, unchanged_count: 15, worsened: ["R2C2"], worsened_population: r.population, newly_critical: ["R2C2"] });
    const html = dashboard(c);
    expect(html).toContain("1 worsened");
    expect(html).toContain("Check the worsened region before relying on this plan.");
    expect(html).toContain("Newly critical with the plan (1)");
    expect(html).toContain("higher peak water");
    expect(html).toContain("+4.0 cm");
    expect(text(<RegionChangeMap comparison={c} selectedId={null} onSelect={() => {}} />)).toContain("\u2191");
  });
  it("zero baseline: no percentage and critical introduced", () => {
    const c = clone(real);
    Object.assign(c.metrics[0], { without: 0, with: 2, absolute_change: 2, percent_change: null, percent_note: "Not defined: the value without interventions is 0.", direction: "worsened" });
    c.earliest_critical = { without: null, with: 40, change_minutes: null, status: "introduced", direction: "worsened", region_without: null, region_with: "R5C3" };
    const html = text(<ComparisonCards comparison={c} />);
    expect(html).toContain("+2 (no percentage: was 0)");
    expect(html).toContain("Turns critical at 40 min with the plan");
    expect(html).toContain("No region turns critical without the plan.");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });
  it("large cities skip the change map and cap the lists", () => {
    const c = clone(real);
    c.meta = { ...c.meta, rows: 40, cols: 40 };
    expect(renderToStaticMarkup(<RegionChangeMap comparison={c} selectedId={null} onSelect={() => {}} />)).toBe("");
    c.region_summary.no_longer_at_risk = Array.from({ length: 30 }, (_, i) => `R${i}`);
    expect(dashboard(c)).toContain("and 6 more");
  });
});
