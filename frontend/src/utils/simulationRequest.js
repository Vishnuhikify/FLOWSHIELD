// Turns the control-panel form into a POST /api/simulate body, and checks it first.
export const DEFAULT_FORM = {
  rainMode: "pattern", // "pattern" = the city's storm pattern, "uniform" = same rate everywhere
  intensity: 100,      // % of the storm pattern
  uniformRate: 80,     // mm/h
  duration: 60,        // minutes
  timestep: 1,         // minutes
  warning: 0.15,       // m
  critical: 0.3,       // m
};

export const TIMESTEPS = [0.5, 1, 2];

export function validateForm(form) {
  const problems = [];
  const steps = form.duration / form.timestep;
  if (!(form.duration > 0)) problems.push("Duration must be greater than 0 minutes.");
  else if (Math.abs(steps - Math.round(steps)) > 1e-9)
    problems.push(`Duration must be a multiple of the ${form.timestep}-minute timestep.`);
  if (!(form.warning > 0)) problems.push("Warning depth must be greater than 0.");
  if (!(form.critical > form.warning)) problems.push("Critical depth must be greater than warning depth.");
  if (form.rainMode === "uniform" && !(form.uniformRate >= 0)) problems.push("Rainfall can't be negative.");
  return problems;
}

/** True when the request needs the city's storm pattern but it has not been learned yet.
 *  Callers must fetch it first: building the request without it would silently drop the intensity. */
export const needsBasePattern = (form, baseRainfall) => form.rainMode === "pattern" && form.intensity !== 100 && !baseRainfall;

/** The cheapest request that reveals the unmodified city (one timestep, baseline, no plan). */
export const BASE_PATTERN_PROBE = { config: { duration_minutes: 1, timestep_minutes: 1 } };

/** Identifies the simulation controls (rainfall + time + thresholds) of a request, ignoring scenario and plan. */
export const controlsKey = (body) => JSON.stringify({ rainfall: body.rainfall ?? null, config: body.config });

/** baseRainfall: the city's own rainfall grid (mm/h), learned from an unmodified baseline response. */
export function buildRequest(form, baseRainfall, scenario, interventions) {
  const body = {
    config: {
      duration_minutes: form.duration,
      timestep_minutes: form.timestep,
      warning_threshold: form.warning,
      critical_threshold: form.critical,
    },
  };
  if (form.rainMode === "uniform") {
    body.rainfall = form.uniformRate;
  } else if (form.intensity !== 100 && baseRainfall) {
    const k = form.intensity / 100;
    body.rainfall = baseRainfall.map((row) => row.map((v) => Math.round(v * k * 100) / 100));
  }
  if (scenario) body.scenario = scenario; // applied by the backend on top of the inputs above
  if (interventions) body.interventions = interventions; // applied after the scenario
  return body;
}
