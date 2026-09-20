import { describe, expect, it } from "vitest";
import { changedRegionIds, movePlanItem, planStatus, regionInputChange, splitPreview, stepStatus, suggestTargets, toggleTarget } from "../interventionLab";
import { newDraft } from "../interventions";
import { describeRunState } from "../runState";

const pump = { id: "activate_pump", name: "Activate emergency pump", target_mode: "required", max_targets: 5,
  params: [{ name: "pump_capacity", label: "Pump capacity", kind: "number", default: 60, minimum: 0, maximum: 500, unit: "mm/h" }] };
const upgrade = { id: "increase_drainage", name: "Increase drainage capacity", target_mode: "optional_all", max_targets: null, params: [] };
const change = (region, before, after) => ({ region, field: "drainage_capacity", unit: "mm/h", before, after });

describe("target selection", () => {
  it("toggles a region on and off", () => {
    const on = toggleTarget(newDraft(pump), "R5C3");
    expect(on.targets).toEqual(["R5C3"]);
    expect(toggleTarget(on, "R5C3").targets).toEqual([]);
  });
  it("suggests the most urgent regions, skipping eased ones and respecting the limit", () => {
    const alerts = [{ id: "A", tier: "critical" }, { id: "B", tier: "eased" }, { id: "C", tier: "soon" }, { id: "D", tier: "watch" }, { id: "E", tier: "watch" }];
    expect(suggestTargets(alerts, pump)).toEqual(["A", "C", "D"]);
    expect(suggestTargets(alerts, { ...pump, max_targets: 2 })).toEqual(["A", "C"]);
    expect(suggestTargets([], pump)).toEqual([]);
  });
});

describe("workflow steps", () => {
  it("a targeted intervention is not ready until a region is chosen", () => {
    expect(stepStatus(pump, newDraft(pump), [], null)).toEqual({ choose: true, targets: false, params: false, plan: false, run: false });
    expect(stepStatus(pump, toggleTarget(newDraft(pump), "R5C3"), [], null)).toMatchObject({ targets: true, params: true });
  });
  it("an optional-target intervention is ready immediately", () => {
    expect(stepStatus(upgrade, newDraft(upgrade), [], null)).toMatchObject({ targets: true, params: true, plan: false });
  });
  it("run is done only when the results on screen include the whole plan", () => {
    const plan = [newDraft(upgrade)];
    expect(stepStatus(upgrade, newDraft(upgrade), plan, { count: 0 }).run).toBe(false);
    expect(stepStatus(upgrade, newDraft(upgrade), plan, { count: 1 })).toMatchObject({ plan: true, run: true });
  });
});

describe("plan", () => {
  it("reorders without mutating and ignores impossible moves", () => {
    const plan = ["a", "b", "c"];
    expect(movePlanItem(plan, 0, 1)).toEqual(["b", "a", "c"]);
    expect(movePlanItem(plan, 2, -1)).toEqual(["a", "c", "b"]);
    expect(movePlanItem(plan, 0, -1)).toBe(plan);
    expect(movePlanItem(plan, 2, 1)).toBe(plan);
    expect(plan).toEqual(["a", "b", "c"]);
  });
  it("reports the plan's status against the results on screen", () => {
    expect(planStatus([], { count: 0 }, false)).toBe("empty");
    expect(planStatus(["x"], { count: 0 }, true)).toBe("not_applied");
    expect(planStatus(["x"], null, false)).toBe("not_applied");
    expect(planStatus(["x"], { count: 1 }, false)).toBe("applied");
    expect(planStatus(["x"], { count: 1 }, true)).toBe("changed");
  });
  it("splits a preview into plan items and the draft item", () => {
    const preview = { interventions: { items: ["p0", "p1", "draft"] } };
    expect(splitPreview(preview, 2, true)).toEqual({ planItems: ["p0", "p1"], draftItem: "draft" });
    expect(splitPreview(preview, 3, false)).toEqual({ planItems: ["p0", "p1", "draft"], draftItem: null });
    expect(splitPreview(null, 2, true)).toEqual({ planItems: [], draftItem: null });
  });
});

describe("applied changes", () => {
  const applied = { count: 2, items: [{ changes: [change("R5C3", 0, 10)] }, { changes: [change("R5C3", 10, 70), change("R4C3", 0, 15)] }] };
  it("nets a region's change across stacked interventions", () => {
    expect(regionInputChange(applied, "R5C3")).toEqual({ before: 0, after: 70, unit: "mm/h" });
    expect(regionInputChange(applied, "R1C1")).toBeNull();
    expect(regionInputChange(null, "R5C3")).toBeNull();
  });
  it("collects the changed regions for the map markers", () => {
    expect([...changedRegionIds(applied)].sort()).toEqual(["R4C3", "R5C3"]);
    expect(changedRegionIds({ items: [] }).size).toBe(0);
  });
});

describe("describeRunState", () => {
  const state = (is_baseline, name, count) => describeRunState({ scenario: { is_baseline, name }, interventions: { count } });
  it("names the four states", () => {
    expect(state(true, "Baseline", 0)).toMatchObject({ kind: "baseline", tone: "baseline", title: "Baseline" });
    expect(state(false, "Heavy rainfall", 0)).toMatchObject({ kind: "scenario", tone: "scenario", title: "Scenario: Heavy rainfall" });
    expect(state(false, "Heavy rainfall", 2)).toMatchObject({ kind: "scenario_interventions", tone: "intervention", title: "Scenario: Heavy rainfall with 2 interventions" });
    expect(state(true, "Baseline", 1)).toMatchObject({ kind: "baseline_interventions", title: "Baseline with 1 intervention" });
  });
  it("shows the input pipeline with the active stages", () => {
    expect(state(false, "Drainage failure", 0).stages.map((s) => [s.label, s.active])).toEqual([
      ["City as configured", true], ["Drainage failure", true], ["No interventions", false]]);
    expect(state(true, "Baseline", 3).stages.map((s) => s.active)).toEqual([true, false, true]);
  });
  it("always says the results are modeled", () => {
    [state(true, "Baseline", 0), state(false, "X", 0), state(false, "X", 1)].forEach((s) => expect(s.note).toMatch(/not a real-world forecast/i));
    expect(state(false, "X", 1).note).toMatch(/intervention/i);
    expect(state(false, "X", 0).note).toMatch(/without interventions/);
  });
});
