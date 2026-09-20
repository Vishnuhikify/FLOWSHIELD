// Presentation logic for the /api/compare response. Pure functions; no numbers are invented here.
import { formatMinutes, formatPeople } from "./format";

export const CARD_KEYS = ["critical_regions", "warning_regions", "affected_population", "critical_population", "max_water_level", "total_drained"];

export const DIRECTION = {
  improved: { label: "Improved", text: "text-safe", bar: "bg-safe", tint: "bg-safe-tint", hex: "#2a6f5f" },
  worsened: { label: "Worsened", text: "text-critical", bar: "bg-critical", tint: "bg-critical-tint", hex: "#a8231c" },
  unchanged: { label: "No change", text: "text-ink-soft", bar: "bg-ink-soft", tint: "bg-white", hex: "#4a6076" },
};

export const metricsByKey = (comparison) => Object.fromEntries(comparison.metrics.map((m) => [m.key, m]));

const signed = (n, text) => (n > 0 ? `+${text}` : n < 0 ? `\u2212${text}` : text);

/** One metric value in display units. Water removed is shown as mm per region, which reads better than summed metres. */
export function formatMetricValue(metric, value, regionCount = 1) {
  if (metric.key === "total_drained") return `${((Math.abs(value) * 1000) / Math.max(1, regionCount)).toFixed(1)} mm`;
  if (metric.unit === "m") return `${Math.abs(value).toFixed(2)} m`;
  if (metric.unit === "people") return formatPeople(Math.abs(value));
  return String(Math.abs(value));
}

export function metricLabel(metric) {
  return metric.key === "total_drained" ? "Water removed, average per region" : metric.label;
}

/** "−1 (−50%)", "+0.03 m (+8.2%)", "No change", or a percentage-free form when the baseline value was 0. */
export function formatChange(metric, regionCount = 1) {
  if (metric.direction === "unchanged" && metric.absolute_change === 0) return "No change";
  const abs = signed(metric.absolute_change, formatMetricValue(metric, metric.absolute_change, regionCount));
  if (metric.percent_change == null) return `${abs} (no percentage: was 0)`;
  return `${abs} (${signed(metric.percent_change, `${Math.abs(metric.percent_change).toFixed(1)}%`)})`;
}

/** Share of the larger value, for the paired before/after bars. Safe when both are 0. */
export function barShares(metric) {
  const top = Math.max(Math.abs(metric.without), Math.abs(metric.with));
  if (top === 0) return { without: 0, with: 0 };
  return { without: (Math.abs(metric.without) / top) * 100, with: (Math.abs(metric.with) / top) * 100 };
}

const time = (t) => (t == null ? "not reached" : formatMinutes(t));

/** Plain wording for a time-to-critical comparison, where null means "never critical in this run". */
export function timeChangeText(t) {
  switch (t.status) {
    case "prevented": return "Critical flooding not reached with the plan";
    case "introduced": return `Turns critical at ${formatMinutes(t.with)} with the plan`;
    case "delayed": return `Delayed by ${formatMinutes(t.change_minutes)}`;
    case "earlier": return `${formatMinutes(-t.change_minutes)} earlier`;
    case "same": return "Same time";
    default: return "Not critical in either run";
  }
}

export const timePair = (t) => ({ without: time(t.without), with: time(t.with) });

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A balanced one-paragraph reading of the comparison. States worsening as prominently as improvement. */
export function headline(comparison) {
  const s = comparison.region_summary;
  if (s.improved_count === 0 && s.worsened_count === 0)
    return { tone: "unchanged", text: "Under this simulation the plan changes no modeled outcome. Every region is the same with and without it." };
  const parts = [`${plural(s.improved_count, "region")} improve`, `${s.unchanged_count} stay the same`, `${s.worsened_count} worsen`];
  const tone = s.worsened_count > 0 ? (s.improved_count > 0 ? "mixed" : "worsened") : "improved";
  const caution =
    s.worsened_count > 0
      ? ` Check the worsened ${s.worsened_count === 1 ? "region" : "regions"} before relying on this plan.`
      : " An improvement in the model is not a guarantee of the same effect in a real flood.";
  return { tone, text: `Under this simulation, with the plan ${parts.join(", ")}.${caution}` };
}

const ORDER = { worsened: 0, improved: 1, unchanged: 2 };

/** Worsened first, then improved, then unchanged; bigger depth changes first within a group. */
export function sortRegions(regions) {
  return [...regions].sort((a, b) => ORDER[a.status] - ORDER[b.status] || Math.abs(b.max_water_change) - Math.abs(a.max_water_change) || a.row - b.row || a.col - b.col);
}

export const REGION_FILTERS = [
  { value: "changed", label: "Changed" },
  { value: "improved", label: "Improved" },
  { value: "worsened", label: "Worsened" },
  { value: "all", label: "All regions" },
];

export function filterRegions(regions, filter) {
  if (filter === "all") return regions;
  if (filter === "changed") return regions.filter((r) => r.status !== "unchanged");
  return regions.filter((r) => r.status === filter);
}

export const CHART_SERIES = [
  { value: "max_water", label: "Deepest water", unit: "m" },
  { value: "affected_population", label: "People affected", unit: "people" },
  { value: "critical_population", label: "People in critical regions", unit: "people" },
];

export function chartRows(timeline, series) {
  return timeline.timestamps.map((t, i) => ({ t, without: timeline.without[series][i], with: timeline.with[series][i] }));
}

export const depthChangeCm = (metres) => signed(metres, `${Math.abs(metres * 100).toFixed(1)} cm`);

/** Status grid for the small change map. */
export function statusGrid(comparison) {
  const { rows, cols } = comparison.meta;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  comparison.regions.forEach((r) => {
    grid[r.row][r.col] = r;
  });
  return grid;
}
