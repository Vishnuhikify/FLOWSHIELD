// Intervention Lab workflow helpers (pure).
import { validateDraft } from "./interventions";

export const toggleTarget = (draft, regionId) =>
  draft.targets.includes(regionId) ? { ...draft, targets: draft.targets.filter((t) => t !== regionId) } : { ...draft, targets: [...draft.targets, regionId] };

/** The most urgent regions from the early-warning ranking, respecting the intervention's target limit. */
export function suggestTargets(alerts, spec, count = 3) {
  const limit = spec.max_targets == null ? count : Math.min(count, spec.max_targets);
  return alerts.filter((a) => a.tier !== "eased").slice(0, limit).map((a) => a.id);
}

export function movePlanItem(plan, index, delta) {
  const to = index + delta;
  if (to < 0 || to >= plan.length) return plan;
  const next = [...plan];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/** Which of the five workflow steps are done, for the step markers. */
export function stepStatus(spec, draft, plan, applied) {
  const needsTarget = spec.target_mode === "required";
  const draftValid = validateDraft(spec, draft).length === 0;
  return {
    choose: true,
    targets: needsTarget ? draft.targets.length > 0 : true,
    params: draftValid,
    plan: plan.length > 0,
    run: plan.length > 0 && Boolean(applied) && applied.count === plan.length,
  };
}

/** The preview is requested for plan + draft; this splits the answer back apart. */
export function splitPreview(preview, planLength, draftIncluded) {
  const items = preview?.interventions.items ?? [];
  return { planItems: items.slice(0, planLength), draftItem: draftIncluded ? items[planLength] ?? null : null };
}

/** Human status of the plan against the results on screen. */
export function planStatus(plan, applied, stale) {
  if (plan.length === 0) return "empty";
  if (!applied || applied.count === 0) return "not_applied"; // results on screen are without interventions
  return stale ? "changed" : "applied";
}

/** Net drain-capacity change of one region across all applied interventions, or null. */
export function regionInputChange(applied, regionId) {
  const hits = (applied?.items ?? []).flatMap((item) => item.changes.filter((c) => c.region === regionId));
  if (hits.length === 0) return null;
  return { before: hits[0].before, after: hits[hits.length - 1].after, unit: hits[0].unit };
}

export const changedRegionIds = (applied) => new Set((applied?.items ?? []).flatMap((item) => item.changes.map((c) => c.region)));
