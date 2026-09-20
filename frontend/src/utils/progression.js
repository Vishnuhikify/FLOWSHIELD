// Reads "what is true at timestep N" out of the /api/simulate response. Pure functions.
import { clampStep } from "./playback";

const RANK = { SAFE: 0, WARNING: 1, CRITICAL: 2 };
const LEVELS = ["SAFE", "WARNING", "CRITICAL"];
const STEADY_M_PER_MIN = 0.0002; // below 0.2 mm/min a level counts as steady

/** City-wide state at one timestep. */
export function frameAt(data, step) {
  const tl = data.timeline;
  const last = tl.timestamps.length - 1;
  const s = clampStep(step, last);
  return {
    step: s,
    lastStep: last,
    time: tl.timestamps[s],
    endTime: tl.timestamps[last],
    isStart: s === 0,
    isFinal: s === last,
    critical: tl.critical_region_count[s],
    warning: tl.warning_region_count[s],
    safe: tl.safe_region_count[s],
    criticalPopulation: tl.critical_population[s],
    warningPopulation: tl.warning_population[s],
    affectedPopulation: tl.affected_population[s],
    maxWater: tl.max_water[s],
  };
}

export function deepestRegionAt(data, step) {
  const grid = data.timeline.water_levels[clampStep(step, data.timeline.timestamps.length - 1)];
  let best = null;
  let depth = 0;
  grid.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v > depth) [depth, best] = [v, data.city.region_ids[r][c]];
    })
  );
  return best; // null when the whole city is dry
}

/** First timestep with any warning-or-worse region, and first with any critical region (or null). */
export function milestones(timeline) {
  const first = (test) => {
    const i = timeline.timestamps.findIndex((_, k) => test(k));
    return i < 0 ? null : i;
  };
  return {
    firstWarningStep: first((k) => timeline.warning_region_count[k] + timeline.critical_region_count[k] > 0),
    firstCriticalStep: first((k) => timeline.critical_region_count[k] > 0),
  };
}

/** One region at one timestep: what is true now, and how now relates to its forecast. */
export function regionStateAt(data, region, step) {
  const tl = data.timeline;
  const s = clampStep(step, tl.timestamps.length - 1);
  const { row, col } = region;
  const depth = tl.water_levels[s][row][col];
  const risk = tl.risk_levels[s][row][col];

  let changePerMin = 0;
  if (s > 0) {
    const dt = tl.timestamps[s] - tl.timestamps[s - 1];
    changePerMin = dt > 0 ? (depth - tl.water_levels[s - 1][row][col]) / dt : 0;
  }
  const trend = changePerMin > STEADY_M_PER_MIN ? "rising" : changePerMin < -STEADY_M_PER_MIN ? "falling" : "steady";

  const criticalAt = region.time_to_critical; // null = never in this run
  const minutesToCritical = criticalAt == null ? null : criticalAt - tl.timestamps[s];
  const outlook = criticalAt == null ? "never" : minutesToCritical > 0 ? "upcoming" : "reached";

  return { depth, risk, changePerMin, trend, criticalAt, minutesToCritical, outlook };
}

/** Worst risk level in the city at each timestep, run-length encoded as fractions of the slider. */
export function riskBandSegments(timeline) {
  const n = timeline.timestamps.length;
  const last = Math.max(1, n - 1);
  const levelAt = (k) => (timeline.critical_region_count[k] > 0 ? 2 : timeline.warning_region_count[k] > 0 ? 1 : 0);
  const segments = [];
  for (let k = 0; k < n; k += 1) {
    const level = LEVELS[levelAt(k)];
    const tail = segments[segments.length - 1];
    if (tail && tail.level === level) tail.toStep = k;
    else segments.push({ level, fromStep: k, toStep: k });
  }
  return segments.map((seg) => ({
    ...seg,
    from: Math.max(0, (seg.fromStep - 0.5) / last),
    to: Math.min(1, (seg.toStep + 0.5) / last),
  }));
}

export function bandGradient(segments, colors) {
  const stops = segments.flatMap((s) => [
    `${colors[s.level]} ${(s.from * 100).toFixed(3)}%`,
    `${colors[s.level]} ${(s.to * 100).toFixed(3)}%`,
  ]);
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

/** Nearest timestep index for a time in minutes. */
export function stepForTime(timestamps, minutes) {
  let best = 0;
  timestamps.forEach((t, i) => {
    if (Math.abs(t - minutes) < Math.abs(timestamps[best] - minutes)) best = i;
  });
  return best;
}

export const worseThan = (a, b) => RANK[a] > RANK[b];
