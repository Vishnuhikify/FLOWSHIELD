// Demo mode: a fixed script that drives the REAL controls and the real backend.
// Nothing here contains a result. Every number shown during the demo comes from /api/simulate or /api/compare.
// Determinism: the script always resets to the default controls, uses the catalogue's default parameters,
// and picks targets by a fixed rule from the real result, so the same steps give the same outcome every time.
import { newDraft } from "./interventions";
import { milestones } from "./progression";
import { BASELINE_ID, selectScenario } from "./scenarios";

export const DEMO_SCENARIO_ID = "heavy_rainfall";
export const DEMO_PUMP_ID = "activate_pump";
export const DEMO_UPGRADE_ID = "increase_drainage";
export const DEMO_PLAYBACK_SPEED = 4;

export const DEMO_STEPS = [
  { id: "baseline", title: "Start from the baseline", section: "results", say: "Everything is reset to the default controls and the baseline city is simulated. This is the reference case." },
  { id: "scenario", title: "Run the heavy rainfall scenario", section: "results", say: "The Scenario lab scales the storm up and the same engine runs again. The banner and the map now show the scenario's end state." },
  { id: "progression", title: "Watch the flood develop", section: "progression", say: "The timeline replays every timestep from 0. The map, the counts and the people in flooded regions are the current state at each moment." },
  { id: "warning", title: "Early warning: jump to the first critical moment", section: "alert", say: "The timeline jumps to the first timestep with a critical region and selects it. Now and forecast are kept apart." },
  { id: "plan", title: "Build an intervention plan", section: "intervention", say: "An emergency pump goes to the region that turns critical first, and drain capacity is increased across the city. The lab shows the exact input changes before anything is run." },
  { id: "intervene", title: "Run with the interventions", section: "results", say: "Same scenario and controls, now with the plan. The green corner flags mark regions whose drains were changed." },
  { id: "impact", title: "Modeled impact: without and with the plan", section: "modeled-impact", say: "Both runs side by side from /api/compare. These are modeled results under the simulation's assumptions, not measured effects." },
];

export const demoReady = (catalog, interventionCatalog) =>
  Boolean(catalog?.scenarios.some((s) => s.id === DEMO_SCENARIO_ID)) &&
  [DEMO_PUMP_ID, DEMO_UPGRADE_ID].every((id) => interventionCatalog?.interventions.some((i) => i.id === id));

export const demoBaselineSelection = () => ({ id: BASELINE_ID, params: {} });

/** Heavy rainfall with the catalogue's default parameters. */
export const demoScenarioSelection = (catalog) => selectScenario(catalog.scenarios.find((s) => s.id === DEMO_SCENARIO_ID));

/** Pump on the region that turns critical first (or, if none does, the deepest one), then a city-wide drain upgrade.
 *  Both use the catalogue defaults. The target comes from the real scenario result. */
export function buildDemoPlan(data, interventionCatalog) {
  const spec = (id) => interventionCatalog.interventions.find((i) => i.id === id);
  const target = data.summary.earliest_critical_region ?? data.summary.max_water_region;
  return [{ ...newDraft(spec(DEMO_PUMP_ID)), targets: [target] }, newDraft(spec(DEMO_UPGRADE_ID))];
}

/** Where the early-warning step jumps to: the first critical timestep, else the first warning, else the end. */
export function demoWarningJump(data) {
  const marks = milestones(data.timeline);
  const step = marks.firstCriticalStep ?? marks.firstWarningStep ?? data.timeline.timestamps.length - 1;
  return { step, regionId: data.summary.earliest_critical_region ?? data.summary.max_water_region };
}

/** One factual line per step, built from the results on screen. Returns "" when there is nothing to report yet. */
export function demoFact(stepId, data, comparison) {
  if (!data) return "";
  const s = data.summary;
  const critical = s.earliest_critical_time == null ? "no region turns critical" : `${s.earliest_critical_region} turns critical first, at ${s.earliest_critical_time} min`;
  switch (stepId) {
    case "baseline":
    case "scenario":
    case "intervene":
      return `In this run: ${s.critical_region_count} critical and ${s.warning_region_count} warning regions, ${critical}.`;
    case "warning":
      return `In this run ${critical}.`;
    case "plan":
      return `Pump target from the scenario result: ${s.earliest_critical_region ?? s.max_water_region}.`;
    case "impact": {
      if (!comparison) return "";
      const r = comparison.region_summary;
      return `In this comparison: ${r.improved_count} regions improved, ${r.unchanged_count} unchanged, ${r.worsened_count} worsened.`;
    }
    default:
      return "";
  }
}
