// Early-warning logic. Everything is derived from the /api/simulate response - no new API data.
//
// Two ideas are kept strictly apart:
//   NOW      = the state at the selected timestep
//   FORECAST = what the full run predicts if conditions stay unchanged ("under this simulation")
import { clampStep } from "./playback";
import { milestones, regionStateAt } from "./progression";

// Urgency bands, in minutes until a region turns critical. Presentation assumptions for this prototype.
export const LEAD = { imminent: 10, soon: 30 };

export const URGENCY = {
  critical: { rank: 0, label: "Critical now" },
  imminent: { rank: 1, label: `Critical within ${LEAD.imminent} min` },
  soon: { rank: 2, label: `Critical within ${LEAD.soon} min` },
  warning: { rank: 3, label: "Warning now" },
  watch: { rank: 4, label: "Watch" },
  eased: { rank: 5, label: "Eased" },
};

/** Per-region forecast facts for every region that leaves SAFE at some point in the run. Built once per result. */
export function buildWarningIndex(data) {
  const { timestamps, risk_levels: risk, water_levels: water } = data.timeline;
  return data.regions
    .filter((r) => r.peak_risk !== "SAFE")
    .map((r) => {
      let firstWarningStep = null;
      let peakStep = 0;
      for (let k = 0; k < timestamps.length; k += 1) {
        if (firstWarningStep === null && risk[k][r.row][r.col] !== "SAFE") firstWarningStep = k;
        if (water[k][r.row][r.col] > water[peakStep][r.row][r.col]) peakStep = k;
      }
      const firstWarningTime = firstWarningStep === null ? null : timestamps[firstWarningStep];
      const criticalAt = r.time_to_critical;
      const criticalStep = criticalAt == null ? null : timestamps.findIndex((t) => t >= criticalAt);
      return {
        id: r.id, row: r.row, col: r.col, population: r.population,
        peakRisk: r.peak_risk, peakDepth: r.max_water_level, peakTime: timestamps[peakStep],
        firstWarningStep, firstWarningTime, criticalStep, criticalAt,
        // Minutes between the first warning and turning critical: the time available to act.
        leadMinutes: criticalAt == null || firstWarningTime == null ? null : criticalAt - firstWarningTime,
      };
    });
}

export function urgencyTier(riskNow, minutesToCritical, minutesToWarning) {
  if (riskNow === "CRITICAL") return "critical";
  if (minutesToCritical != null && minutesToCritical > 0) {
    if (minutesToCritical <= LEAD.imminent) return "imminent";
    if (minutesToCritical <= LEAD.soon) return "soon";
  }
  if (riskNow === "WARNING") return "warning";
  const stillAhead = (minutesToCritical != null && minutesToCritical > 0) || (minutesToWarning != null && minutesToWarning > 0);
  return stillAhead ? "watch" : "eased";
}

const ahead = (m) => (m != null && m > 0 ? m : Infinity); // only warnings still to come affect the order

/** The warning index seen from one timestep, most urgent first. */
export function alertsAt(data, index, step) {
  const s = clampStep(step, data.timeline.timestamps.length - 1);
  const time = data.timeline.timestamps[s];
  return index
    .map((entry) => {
      const now = regionStateAt(data, entry, s);
      const minutesToCritical = entry.criticalAt == null ? null : entry.criticalAt - time;
      const minutesToWarning = entry.firstWarningTime == null ? null : entry.firstWarningTime - time;
      return { ...entry, now, minutesToCritical, minutesToWarning, tier: urgencyTier(now.risk, minutesToCritical, minutesToWarning) };
    })
    .sort(
      (a, b) =>
        URGENCY[a.tier].rank - URGENCY[b.tier].rank ||
        (a.minutesToCritical ?? Infinity) - (b.minutesToCritical ?? Infinity) ||
        ahead(a.minutesToWarning) - ahead(b.minutesToWarning) ||
        b.population - a.population ||
        b.peakDepth - a.peakDepth
    );
}

/** Regions that are warning / critical at this timestep, and the regions forecast to turn critical. */
export function regionGroups(alerts) {
  return {
    criticalNow: alerts.filter((a) => a.now.risk === "CRITICAL"),
    warningNow: alerts.filter((a) => a.now.risk === "WARNING"),
    forecastCritical: alerts.filter((a) => a.criticalAt != null).sort((a, b) => a.criticalAt - b.criticalAt),
  };
}

/** Now-vs-forecast numbers. "now" moves with the timeline; "forecast" is fixed for the run. */
export function nowVsForecast(data, step) {
  const tl = data.timeline;
  const s = clampStep(step, tl.timestamps.length - 1);
  const f = data.summary;
  return {
    affectedPeople: { now: tl.affected_population[s], forecast: f.affected_population },
    criticalPeople: { now: tl.critical_population[s], forecast: f.critical_population },
    warningPeople: { now: tl.warning_population[s], forecast: f.warning_population },
    criticalRegions: { now: tl.critical_region_count[s], forecast: f.critical_region_count },
    warningRegions: { now: tl.warning_region_count[s], forecast: f.warning_region_count },
    totalPeople: f.total_population,
  };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const mins = (m) => `${Number(m.toFixed(1))} min`;

/** City-level alert for the banner: level, a current-state sentence and a forecast sentence. */
export function cityOutlook(data, alerts, step) {
  const tl = data.timeline;
  const s = clampStep(step, tl.timestamps.length - 1);
  const time = tl.timestamps[s];
  const marks = milestones(tl);
  const event = (k) => (k == null ? null : { step: k, time: tl.timestamps[k], minutesAway: tl.timestamps[k] - time });

  const criticalNow = tl.critical_region_count[s];
  const warningNow = tl.warning_region_count[s];
  const next = alerts.filter((a) => a.minutesToCritical != null && a.minutesToCritical > 0).sort((a, b) => a.minutesToCritical - b.minutesToCritical)[0] ?? null;
  const moreCritical = alerts.filter((a) => a.minutesToCritical != null && a.minutesToCritical > 0).length;

  let level = "clear";
  if (criticalNow > 0) level = "critical";
  else if (next && next.minutesToCritical <= LEAD.imminent) level = "imminent";
  else if (next && next.minutesToCritical <= LEAD.soon) level = "soon";
  else if (warningNow > 0) level = "warning";
  else if (alerts.some((a) => a.tier === "watch")) level = "watch";

  const current =
    criticalNow > 0
      ? `${plural(criticalNow, "region")} critical${warningNow > 0 ? ` and ${warningNow} at warning` : ""}.`
      : warningNow > 0
      ? `${plural(warningNow, "region")} at warning, none critical.`
      : "No region at warning or critical.";

  let forecast;
  if (next) forecast = `Under this simulation, ${next.id} turns critical in ${mins(next.minutesToCritical)}${moreCritical > 1 ? `, followed by ${plural(moreCritical - 1, "more region")}` : ""}.`;
  else if (data.summary.critical_region_count > 0) forecast = "Under this simulation, no further region turns critical before the run ends.";
  else if (alerts.some((a) => a.minutesToWarning > 0)) {
    const w = alerts.filter((a) => a.minutesToWarning > 0).sort((a, b) => a.minutesToWarning - b.minutesToWarning)[0];
    forecast = `Under this simulation, ${w.id} reaches warning in ${mins(w.minutesToWarning)}. No region is forecast to turn critical in this run.`;
  } else if (alerts.length > 0) forecast = "No region is forecast to turn critical in this run.";
  else forecast = "Under this simulation, every region stays below the warning depth for the whole run.";

  return { level, time, current, forecast, firstWarning: event(marks.firstWarningStep), firstCritical: event(marks.firstCriticalStep), nextCritical: next };
}

/** "in 7 min" / "now" / "12 min ago" for a signed minutes-away value. */
export function relativeTime(minutesAway) {
  if (minutesAway == null) return "";
  if (Math.abs(minutesAway) < 1e-9) return "now";
  return minutesAway > 0 ? `in ${mins(minutesAway)}` : `${mins(-minutesAway)} ago`;
}
