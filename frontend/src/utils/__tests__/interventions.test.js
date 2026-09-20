import { describe, expect, it } from "vitest";
import { addTarget, buildInterventionsPayload, changeLines, describePlanItem, newDraft, planIsStale, removeTarget, validateDraft } from "../interventions";
import { buildRequest, DEFAULT_FORM } from "../simulationRequest";

const pump = { id: "activate_pump", name: "Activate emergency pump", target_mode: "required", max_targets: 5,
  params: [{ name: "pump_capacity", label: "Pump capacity", kind: "number", default: 60, minimum: 0, maximum: 500, unit: "mm/h" }] };
const upgrade = { id: "increase_drainage", name: "Increase drainage capacity", target_mode: "optional_all", max_targets: null,
  params: [{ name: "increase_percent", label: "Capacity increase", kind: "number", default: 50, minimum: 0, maximum: 300, unit: "%" }] };
const channel = { id: "restore_channel", name: "Restore blocked channel", target_mode: "channel", max_targets: null, params: [] };

describe("draft", () => {
  it("starts with catalogue defaults and no targets", () => expect(newDraft(pump)).toEqual({ id: "activate_pump", targets: [], params: { pump_capacity: 60 } }));
  it("adds each target once and removes it", () => {
    let d = addTarget(addTarget(newDraft(pump), "R5C3"), "R5C3");
    expect(d.targets).toEqual(["R5C3"]);
    expect(addTarget(d, null).targets).toEqual(["R5C3"]);
    expect(removeTarget(d, "R5C3").targets).toEqual([]);
  });
  it("requires a target only where the catalogue says so", () => {
    expect(validateDraft(pump, newDraft(pump))).toEqual(["Choose at least one target region."]);
    expect(validateDraft(pump, addTarget(newDraft(pump), "R5C3"))).toEqual([]);
    expect(validateDraft(upgrade, newDraft(upgrade))).toEqual([]);
    expect(validateDraft(channel, newDraft(channel))).toEqual([]);
  });
  it("enforces target and parameter limits", () => {
    const many = { ...newDraft(pump), targets: ["a", "b", "c", "d", "e", "f"] };
    expect(validateDraft(pump, many)).toHaveLength(1);
    expect(validateDraft(pump, { ...newDraft(pump), targets: ["a"], params: { pump_capacity: 900 } })).toHaveLength(1);
  });
});

describe("request", () => {
  it("an empty plan leaves the request untouched", () => {
    expect(buildInterventionsPayload([])).toBeUndefined();
    expect(buildRequest(DEFAULT_FORM, null, undefined, buildInterventionsPayload([]))).toEqual(buildRequest(DEFAULT_FORM, null));
  });
  it("sends id, params and only explicit targets", () => {
    const plan = [{ id: "activate_pump", targets: ["R5C3"], params: { pump_capacity: 80 } }, newDraft(upgrade)];
    expect(buildInterventionsPayload(plan)).toEqual([
      { id: "activate_pump", targets: ["R5C3"], params: { pump_capacity: 80 } },
      { id: "increase_drainage", params: { increase_percent: 50 } },
    ]);
    const body = buildRequest(DEFAULT_FORM, null, { id: "blocked_channel", params: {} }, buildInterventionsPayload(plan));
    expect(body.scenario.id).toBe("blocked_channel");
    expect(body.interventions).toHaveLength(2);
  });
});

describe("result helpers", () => {
  const applied = { count: 1, items: [{ id: "activate_pump", targets: ["R5C3"], params: { pump_capacity: 60 }, changed_region_count: 1, note: "",
    changes: [{ region: "R5C3", before: 10, after: 70, unit: "mm/h" }] }] };
  it("describes a plan item", () => {
    expect(describePlanItem({ id: "activate_pump", targets: ["R5C3"], params: { pump_capacity: 60 } }, pump)).toBe("Activate emergency pump on R5C3, 60 mm/h");
    expect(describePlanItem(newDraft(upgrade), upgrade)).toBe("Increase drainage capacity on every region, 50%");
    expect(describePlanItem(newDraft(channel), channel)).toBe("Restore blocked channel on the channel");
  });
  it("detects when the plan no longer matches the results", () => {
    const plan = [{ id: "activate_pump", targets: ["R5C3"], params: { pump_capacity: 60 } }];
    expect(planIsStale(plan, applied)).toBe(false);
    expect(planIsStale([], applied)).toBe(true);
    expect(planIsStale([{ ...plan[0], params: { pump_capacity: 90 } }], applied)).toBe(true);
    expect(planIsStale([{ ...plan[0], targets: ["R4C3"] }], applied)).toBe(true);
    expect(planIsStale([], { count: 0, items: [] })).toBe(false);
    expect(planIsStale(plan, null)).toBe(false);
  });
  it("treats server-resolved default targets as matching", () => {
    const resolved = { count: 1, items: [{ id: "restore_channel", targets: ["R1C3", "R2C3"], params: {} }] };
    expect(planIsStale([newDraft(channel)], resolved)).toBe(false);
  });
  it("lists the exact input changes from the response", () => {
    expect(changeLines(applied.items[0])).toEqual(["R5C3 drain capacity 10 to 70 mm/h"]);
    const big = { changed_region_count: 25, note: "", changes: Array.from({ length: 25 }, (_, i) => ({ region: `R${i}`, before: 1, after: 2, unit: "mm/h" })) };
    expect(changeLines(big)).toHaveLength(7);
    expect(changeLines(big)[6]).toBe("and 19 more regions");
    expect(changeLines({ changes: [], changed_region_count: 0, note: "No input changed: already fine." })).toEqual(["No input changed: already fine."]);
  });
});
