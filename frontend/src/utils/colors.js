// Colour ramps for the flood grid. Pure functions so they are easy to test.
import { RISK } from "./risk";
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

export function interpolate(stops, t) {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const [a, b] = [hexToRgb(stops[i]), hexToRgb(stops[i + 1])];
  const f = x - i;
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(", ")})`;
}

export const WATER_STOPS = ["#f4f7f9", "#c3dcee", "#6aa6d4", "#1f5f9e", "#0b2f5c"];
export const TERRAIN_STOPS = ["#dfe9d6", "#c9cfa4", "#b39d6f", "#8a6f4d"];

// Depth scale tops out at 1.5x the critical threshold so colours mean the same at every timestep.
export const depthScaleMax = (criticalThreshold) => criticalThreshold * 1.5;

export const waterColor = (depth, criticalThreshold) =>
  interpolate(WATER_STOPS, depth / depthScaleMax(criticalThreshold));

export const terrainColor = (elevation, min, max) =>
  interpolate(TERRAIN_STOPS, max > min ? (elevation - min) / (max - min) : 0.5);

export const needsLightText = (depth, criticalThreshold) => depth / depthScaleMax(criticalThreshold) > 0.5;

/** Fill + text colour for one cell. Shared by the DOM grid and the canvas grid. */
export function cellColors(view, depth, risk, elevation, ctx) {
  if (view === "risk")
    return { background: RISK[risk].fill, color: risk === "CRITICAL" ? "#fff" : risk === "WARNING" ? "#3d2500" : RISK.SAFE.hex };
  if (view === "terrain") return { background: terrainColor(elevation, ctx.minElev, ctx.maxElev), color: "#10273d" };
  return { background: waterColor(depth, ctx.critical), color: needsLightText(depth, ctx.critical) ? "#fff" : "#10273d" };
}

/** Above this many cells the grid is painted on a canvas instead of one DOM button per cell. */
export const CANVAS_CELL_LIMIT = 400;
