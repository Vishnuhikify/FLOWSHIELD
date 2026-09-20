// Scenario Lab helpers. The catalogue itself (names, descriptions, parameter ranges) comes from GET /api/scenarios.
export const BASELINE_ID = "baseline";

export const numberParams = (scenario) => (scenario?.params ?? []).filter((p) => p.kind === "number");

/** Default values for the parameters the UI edits. */
export function defaultParams(scenario) {
  return Object.fromEntries(numberParams(scenario).map((p) => [p.name, p.default]));
}

export const selectScenario = (scenario) => ({ id: scenario.id, params: defaultParams(scenario) });

export function validateScenarioParams(scenario, params) {
  return numberParams(scenario).flatMap((p) => {
    const v = params[p.name];
    if (typeof v !== "number" || !Number.isFinite(v)) return [`${p.label} needs a number.`];
    if (v < p.minimum || v > p.maximum) return [`${p.label} must be between ${p.minimum} and ${p.maximum}${p.unit}.`];
    return [];
  });
}

/** The `scenario` field of the POST /api/simulate body. Baseline sends nothing, so it is exactly the default run. */
export function buildScenarioPayload(selection) {
  if (!selection || selection.id === BASELINE_ID) return undefined;
  return { id: selection.id, params: { ...selection.params } };
}

/** True when the lab selection differs from the scenario that produced the results on screen. */
export function isStale(selection, resultScenario) {
  if (!selection || !resultScenario) return false;
  if (selection.id !== resultScenario.id) return true;
  return Object.entries(selection.params).some(([name, value]) => resultScenario.params[name] !== value);
}

export const formatParam = (spec, value) => (spec.unit === "%" ? `${value}%` : spec.unit === "x" ? `${value}x` : `${value} ${spec.unit}`.trim());

const mmh = (n) => `${Number(n.toFixed(1))} mm/h`;

/** What the scenario changed, from the response's scenario.changes block (real numbers, not descriptions). */
export function changeSummary(resultScenario) {
  if (!resultScenario || resultScenario.is_baseline) return [];
  const c = resultScenario.changes;
  const lines = [];
  if (c.mean_rainfall_after !== c.mean_rainfall_before) lines.push(`Mean rainfall ${mmh(c.mean_rainfall_before)} to ${mmh(c.mean_rainfall_after)}`);
  if (c.mean_drainage_after !== c.mean_drainage_before) lines.push(`Mean drain capacity ${mmh(c.mean_drainage_before)} to ${mmh(c.mean_drainage_after)}`);
  if (c.affected_regions.length > 0 && c.affected_regions.length <= 12) lines.push(`Regions modified: ${c.affected_regions.join(", ")}`);
  else lines.push(`${c.affected_region_count} region${c.affected_region_count === 1 ? "" : "s"} modified`);
  return lines;
}
