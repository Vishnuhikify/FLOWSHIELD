// Intervention plan helpers. The catalogue (names, target rules, parameter ranges) comes from GET /api/interventions.
import { defaultParams, formatParam, numberParams, validateScenarioParams } from "./scenarios";

export const newDraft = (spec) => ({ id: spec.id, targets: [], params: defaultParams(spec) });

export const TARGET_HINT = {
  required: "Choose at least one target region.",
  optional_all: "With no target it applies to every region.",
  channel: "With no target it uses the channel blocked by the scenario, or the default channel.",
};

export function validateDraft(spec, draft) {
  const problems = validateScenarioParams(spec, draft.params);
  if (spec.target_mode === "required" && draft.targets.length === 0) problems.push("Choose at least one target region.");
  if (spec.max_targets != null && draft.targets.length > spec.max_targets) problems.push(`${spec.name} accepts at most ${spec.max_targets} regions.`);
  return problems;
}

export const addTarget = (draft, regionId) => (regionId && !draft.targets.includes(regionId) ? { ...draft, targets: [...draft.targets, regionId] } : draft);

export const removeTarget = (draft, regionId) => ({ ...draft, targets: draft.targets.filter((t) => t !== regionId) });

/** The `interventions` field of the POST /api/simulate body. An empty plan sends nothing. */
export function buildInterventionsPayload(plan) {
  if (!plan || plan.length === 0) return undefined;
  return plan.map((item) => ({ id: item.id, ...(item.targets.length > 0 ? { targets: [...item.targets] } : {}), params: { ...item.params } }));
}

export function describePlanItem(item, spec) {
  const where = item.targets.length > 0 ? item.targets.join(", ") : spec?.target_mode === "optional_all" ? "every region" : "the channel";
  const values = numberParams(spec).map((p) => formatParam(p, item.params[p.name])).join(", ");
  return `${spec?.name ?? item.id} on ${where}${values ? `, ${values}` : ""}`;
}

/** True when the plan differs from the interventions that produced the results on screen. */
export function planIsStale(plan, applied) {
  if (!applied) return false;
  if (plan.length !== applied.count) return true;
  return plan.some((item, i) => {
    const a = applied.items[i];
    if (a.id !== item.id) return true;
    if (item.targets.length > 0 && [...item.targets].sort().join() !== [...a.targets].sort().join()) return true;
    return Object.entries(item.params).some(([k, v]) => a.params[k] !== v);
  });
}

/** Exactly which inputs an applied intervention changed, from the response. */
export function changeLines(appliedItem, limit = 6) {
  if (appliedItem.changes.length === 0) return [appliedItem.note || "No input changed."];
  const lines = appliedItem.changes.slice(0, limit).map((c) => `${c.region} drain capacity ${c.before} to ${c.after} ${c.unit}`);
  const rest = appliedItem.changed_region_count - lines.length;
  if (rest > 0) lines.push(`and ${rest} more region${rest === 1 ? "" : "s"}`);
  return lines;
}
