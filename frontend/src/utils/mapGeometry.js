// Geography for Map View. Visualization only: it places the SAME regions and the SAME timestep data the
// grid uses onto a fixed demo area. It never reads the user's location and calls no geocoding or routing API.
import { cellColors } from "./colors";
import { formatDepthCm } from "./format";
import { RISK } from "./risk";

export const LAYOUTS = [
  { value: "grid", label: "Grid view" },
  { value: "map", label: "Map view" },
];
export const DEFAULT_LAYOUT = "grid";

// A fixed, illustrative area: about 5 km x 5 km centred on Bengaluru, India (12.9715 N, 77.5946 E).
// These are constants, not the user's location. The simulated city is synthetic: water levels and risk values
// shown on this area are NOT flood predictions for Bengaluru.
export const DEMO_AREA = { name: "Fixed demo area: central Bengaluru, India", south: 12.949, west: 77.5716, north: 12.994, east: 77.6176 };
export const DEMO_CENTER = [(DEMO_AREA.south + DEMO_AREA.north) / 2, (DEMO_AREA.west + DEMO_AREA.east) / 2];
export const MAP_DISCLAIMER = "Illustrative simulation \u2014 not real flood risk.";

export const OSM_TILES = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

export const areaBounds = (area = DEMO_AREA) => [[area.south, area.west], [area.north, area.east]];

/** Leaflet bounds [[south, west], [north, east]] of one grid cell. Row 0 is the northern edge, like the grid. */
export function regionBounds(row, col, rows, cols, area = DEMO_AREA) {
  const dLat = (area.north - area.south) / rows;
  const dLng = (area.east - area.west) / cols;
  const north = area.north - row * dLat;
  const west = area.west + col * dLng;
  return [[north - dLat, west], [north, west + dLng]];
}

/** Leaflet path style for one region: same fill as the grid cell, risk frame, selection and intervention marks. */
export function regionStyle(view, depth, risk, elevation, ctx, selected, marked) {
  const fill = cellColors(view, depth, risk, elevation, ctx).background;
  const atRisk = risk !== "SAFE" && view !== "risk";
  let color = "rgba(16,39,61,0.35)";
  let weight = 1;
  if (atRisk) { color = RISK[risk].hex; weight = risk === "CRITICAL" ? 4 : 3; }
  if (marked && !atRisk) { color = RISK.SAFE.hex; weight = 2; }
  if (selected) { color = "#10273d"; weight = 5; }
  return { fillColor: fill, fillOpacity: view === "terrain" ? 0.6 : depth < 0.01 && view === "depth" ? 0.25 : 0.72, color, weight, dashArray: marked && !selected ? "6 4" : undefined };
}

/** Everything Map View draws, derived from the simulate response at one timestep. Pure, so it is unit-tested. */
export function mapRegions(data, step, view, selectedId, markedIds, ctx, area = DEMO_AREA) {
  const { rows, cols } = data.meta;
  const water = data.timeline.water_levels[step];
  const risks = data.timeline.risk_levels[step];
  return data.regions.map((r) => {
    const depth = water[r.row][r.col];
    const risk = risks[r.row][r.col];
    const selected = r.id === selectedId;
    const marked = Boolean(markedIds?.has(r.id));
    return {
      id: r.id, depth, risk, selected, marked,
      bounds: regionBounds(r.row, r.col, rows, cols, area),
      style: regionStyle(view, depth, risk, r.elevation, ctx, selected, marked),
      label: view === "terrain" ? `${r.elevation.toFixed(1)} m` : `${formatDepthCm(depth)} cm`,
      description: `Region ${r.id}: ${formatDepthCm(depth)} cm of water, ${RISK[risk].label.toLowerCase()}${marked ? ", drain changed by an intervention" : ""}`,
    };
  });
}

/** Bounds around one region, expanded a little so it reads as "focused", not just a tight crop. */
export function focusBounds(row, col, rows, cols, area = DEMO_AREA) {
  const [[s, w], [n, e]] = regionBounds(row, col, rows, cols, area);
  const padLat = (n - s) * 0.6;
  const padLng = (e - w) * 0.6;
  return [[s - padLat, w - padLng], [n + padLat, e + padLng]];
}

/** Labels are drawn on the map only while they stay readable. */
export const showMapLabels = (rows, cols) => rows <= 8 && cols <= 8;
