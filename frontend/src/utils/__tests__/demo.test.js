import { describe, expect, it } from "vitest";
import { buildDemoPlan, DEMO_STEPS, demoBaselineSelection, demoFact, demoReady, demoScenarioSelection, demoWarningJump } from "../demo";
import { buildInterventionsPayload } from "../interventions";
import { buildScenarioPayload } from "../scenarios";
import { buildRequest, DEFAULT_FORM } from "../simulationRequest";
import compare from "./fixtures/compare.json";

const catalog = { scenarios: [{ id: "baseline", params: [] }, { id: "heavy_rainfall", name: "Heavy rainfall", params: [{ name: "rainfall_multiplier", kind: "number", default: 1.3, minimum: 0, maximum: 5 }] }] };
const interventions = { interventions: [
  { id: "activate_pump", name: "Activate emergency pump", target_mode: "required", max_targets: 5, params: [{ name: "pump_capacity", kind: "number", default: 60, minimum: 0, maximum: 500 }] },
  { id: "increase_drainage", name: "Increase drainage capacity", target_mode: "optional_all", max_targets: null, params: [{ name: "increase_percent", kind: "number", default: 50, minimum: 0, maximum: 300 }] },
] };
const result = (over = {}) => ({
  summary: { earliest_critical_region: "R5C3", earliest_critical_time: 25, max_water_region: "R5C3", critical_region_count: 2, warning_region_count: 4, ...over },
  timeline: { timestamps: [0, 1, 2, 3], warning_region_count: [0, 1, 1, 0], critical_region_count: [0, 0, 1, 2] },
});

describe("demo script", () => {
  it("covers the required flow in order", () => {
    expect(DEMO_STEPS.map((s) => s.id)).toEqual(["baseline", "scenario", "progression", "warning", "plan", "intervene", "impact"]);
    DEMO_STEPS.forEach((s) => expect(s.title && s.say && s.section).toBeTruthy());
  });
  it("contains no result numbers in its fixed text", () => {
    DEMO_STEPS.forEach((s) => expect(`${s.title} ${s.say}`).not.toMatch(/\d{2,}|\d+\s?(min|people|regions|%)/));
  });
  it("is only ready when both catalogues offer what the script needs", () => {
    expect(demoReady(catalog, interventions)).toBe(true);
    expect(demoReady(null, interventions)).toBe(false);
    expect(demoReady(catalog, { interventions: interventions.interventions.slice(0, 1) })).toBe(false);
    expect(demoReady({ scenarios: [catalog.scenarios[0]] }, interventions)).toBe(false);
  });
});

describe("deterministic requests", () => {
  it("baseline step sends exactly the default request", () => {
    expect(buildRequest(DEFAULT_FORM, null, buildScenarioPayload(demoBaselineSelection()))).toEqual(buildRequest(DEFAULT_FORM, null));
  });
  it("scenario step uses the catalogue defaults", () => {
    expect(buildScenarioPayload(demoScenarioSelection(catalog))).toEqual({ id: "heavy_rainfall", params: { rainfall_multiplier: 1.3 } });
  });
  it("plan = pump on the first-critical region + city-wide upgrade, catalogue defaults", () => {
    const plan = buildDemoPlan(result(), interventions);
    expect(buildInterventionsPayload(plan)).toEqual([
      { id: "activate_pump", targets: ["R5C3"], params: { pump_capacity: 60 } },
      { id: "increase_drainage", params: { increase_percent: 50 } },
    ]);
    expect(buildDemoPlan(result(), interventions)).toEqual(plan); // same inputs, same plan
  });
  it("falls back to the deepest region when nothing turns critical", () => {
    const plan = buildDemoPlan(result({ earliest_critical_region: null, max_water_region: "R4C2" }), interventions);
    expect(plan[0].targets).toEqual(["R4C2"]);
  });
});

describe("early-warning jump", () => {
  it("goes to the first critical timestep and selects that region", () => expect(demoWarningJump(result())).toEqual({ step: 2, regionId: "R5C3" }));
  it("falls back to first warning, then to the end", () => {
    const warnOnly = result({ earliest_critical_region: null, max_water_region: "R3C3" });
    warnOnly.timeline.critical_region_count = [0, 0, 0, 0];
    expect(demoWarningJump(warnOnly)).toEqual({ step: 1, regionId: "R3C3" });
    warnOnly.timeline.warning_region_count = [0, 0, 0, 0];
    expect(demoWarningJump(warnOnly).step).toBe(3);
  });
});

describe("demo facts come from the results on screen", () => {
  it("quotes the run's own numbers", () => {
    expect(demoFact("scenario", result(), null)).toBe("In this run: 2 critical and 4 warning regions, R5C3 turns critical first, at 25 min.");
    expect(demoFact("warning", result({ earliest_critical_time: null }), null)).toBe("In this run no region turns critical.");
    expect(demoFact("plan", result(), null)).toBe("Pump target from the scenario result: R5C3.");
  });
  it("quotes the real comparison", () => {
    expect(demoFact("impact", result(), compare)).toBe("In this comparison: 9 regions improved, 16 unchanged, 0 worsened.");
  });
  it("says nothing before results exist", () => {
    expect(demoFact("baseline", null, null)).toBe("");
    expect(demoFact("impact", result(), null)).toBe("");
    expect(demoFact("progression", result(), null)).toBe("");
  });
});
