import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import { MapContainer, Rectangle, TileLayer, Tooltip, useMap } from "react-leaflet";
import { areaBounds, DEMO_AREA, focusBounds as computeFocusBounds, MAP_DISCLAIMER, mapRegions, OSM_ATTRIBUTION, OSM_TILES, showMapLabels } from "../utils/mapGeometry";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Fits the whole demo area on mount, then flies/pans to `focusBounds` whenever it changes (Region Focus). */
function FitArea({ bounds, target }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [12, 12] });
    // The map mounts inside a lazily loaded panel; make sure Leaflet measures the final size.
    const t = setTimeout(() => map.invalidateSize(), 150);
    return () => clearTimeout(t);
  }, [map, bounds]);

  useEffect(() => {
    if (!target) return;
    if (prefersReducedMotion()) map.fitBounds(target, { padding: [16, 16] });
    else map.flyToBounds(target, { padding: [16, 16], duration: 0.8 });
  }, [map, target]);
  return null;
}

/** Map View: the same regions, timestep data and selection as the grid, drawn as overlays on OpenStreetMap. */
export default function FloodMap({ data, step, view, ctx, selectedId, onSelect, markedIds, focusRegionId = null }) {
  const bounds = useMemo(() => areaBounds(), []);
  const target = useMemo(() => {
    if (!focusRegionId) return null;
    const r = data.regions.find((x) => x.id === focusRegionId);
    return r ? computeFocusBounds(r.row, r.col, data.meta.rows, data.meta.cols) : null;
  }, [focusRegionId, data]);
  const regions = useMemo(() => mapRegions(data, step, view, selectedId, markedIds, ctx), [data, step, view, selectedId, markedIds, ctx]);
  const labels = showMapLabels(data.meta.rows, data.meta.cols);

  return (
    // `isolate` keeps Leaflet's high z-indexes below the sticky header and the demo bar.
    <div className="relative isolate overflow-hidden rounded-sm border border-line">
      <MapContainer bounds={bounds} scrollWheelZoom={false} preferCanvas={!labels} className="h-[360px] w-full sm:h-[460px] xl:h-[520px]" aria-label="Flood map view of the simulated regions">
        <TileLayer url={OSM_TILES} attribution={OSM_ATTRIBUTION} maxZoom={18} />
        <FitArea bounds={bounds} target={target} />
        {regions.map((r) => (
          <Rectangle key={r.id} bounds={r.bounds} pathOptions={r.style} eventHandlers={{ click: () => onSelect(r.id) }}>
            {labels ? (
              <Tooltip permanent direction="center" className="fs-map-label" opacity={1}>
                <span className="fs-map-id">{r.id}</span>
                <span className="fs-map-value">{r.label}</span>
              </Tooltip>
            ) : (
              <Tooltip sticky>{r.description}</Tooltip>
            )}
          </Rectangle>
        ))}
      </MapContainer>
      <div className="border-t border-line bg-white px-3 py-2 text-sm">
        <p role="note" className="font-semibold text-warning">{MAP_DISCLAIMER}</p>
        <p className="text-ink-soft">
          {DEMO_AREA.name}. The synthetic 5 x 5 city is only placed over this area for orientation: the water levels and risk values are not predictions for Bengaluru.
          Scroll zoom is off: use the + and − buttons.
        </p>
      </div>
    </div>
  );
}
