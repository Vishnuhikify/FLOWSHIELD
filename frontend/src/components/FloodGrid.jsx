import { lazy, memo, Suspense, useMemo } from "react";
import FloodCanvas from "./FloodCanvas";
import { RISK } from "../utils/risk";
import { CANVAS_CELL_LIMIT, cellColors, depthScaleMax, TERRAIN_STOPS, WATER_STOPS } from "../utils/colors";
import { formatDepthCm } from "../utils/format";

// Leaflet is only downloaded when Map view is first opened; Grid view stays the default and is unaffected.
const FloodMap = lazy(() => import("./FloodMap"));

export const VIEWS = [
  { value: "depth", label: "Water depth" },
  { value: "risk", label: "Risk" },
  { value: "terrain", label: "Terrain" },
];

function Legend({ view, ctx }) {
  if (view === "risk")
    return (
      <ul className="flex flex-wrap gap-4 text-sm">
        {Object.entries(RISK).map(([key, r]) => (
          <li key={key} className="flex items-center gap-1.5">
            <span className="inline-block h-3.5 w-3.5 rounded-sm border border-line" style={{ background: r.fill }} />
            {r.label}
          </li>
        ))}
      </ul>
    );
  const terrain = view === "terrain";
  const stops = terrain ? TERRAIN_STOPS : WATER_STOPS;
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
      <span>{terrain ? `${ctx.minElev.toFixed(1)} m` : "Dry"}</span>
      <span className="h-3 w-40 rounded-sm border border-line" style={{ background: `linear-gradient(to right, ${stops.join(", ")})` }} />
      <span>{terrain ? `${ctx.maxElev.toFixed(1)} m elevation` : `${Math.round(depthScaleMax(ctx.critical) * 100)} cm or deeper`}</span>
      {!terrain && (
        <span className="ml-3 flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="inline-block h-3.5 w-3.5 rounded-sm" style={{ boxShadow: `inset 0 0 0 3px ${RISK.WARNING.hex}` }} />Warning</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3.5 w-3.5 rounded-sm" style={{ boxShadow: `inset 0 0 0 4px ${RISK.CRITICAL.hex}` }} />Critical</span>
        </span>
      )}
    </div>
  );
}

/* Memoised: during playback only cells whose depth or risk changed re-render. */
const GridCell = memo(function GridCell({ id, depth, risk, elevation, view, selected, marked, showText, critical, minElev, maxElev, onSelect }) {
  const style = cellColors(view, depth, risk, elevation, { critical, minElev, maxElev });
  // Risk is never colour-only: outside the risk view, non-safe cells carry a frame and a text tag.
  const frame =
    risk === "SAFE" || view === "risk"
      ? "inset 0 0 0 1px rgba(16,39,61,0.12)"
      : `inset 0 0 0 ${risk === "CRITICAL" ? 4 : 3}px ${RISK[risk].hex}`;
  const dry = view !== "terrain" && depth < 0.01;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      aria-label={`Region ${id}: ${formatDepthCm(depth)} cm of water, ${RISK[risk].label.toLowerCase()}${marked ? ", drain changed by an intervention" : ""}`}
      className="relative aspect-square rounded-sm text-left transition-colors duration-200"
      style={{ background: style.background, color: style.color, boxShadow: selected ? `${frame}, 0 0 0 3px #10273d` : frame, zIndex: selected ? 1 : 0 }}
    >
      {marked && <span className="absolute right-0 top-0 h-0 w-0 border-l-[14px] border-t-[14px] border-l-transparent border-t-safe" aria-hidden="true" />}
      {showText && (
        <span className="absolute inset-0 flex flex-col justify-end p-1 sm:justify-between sm:p-2">
          <span className="hidden text-xs font-medium opacity-80 sm:block">{id}</span>
          <span className={dry ? "opacity-50" : ""}>
            <span className={`font-display font-semibold leading-none ${dry ? "text-base sm:text-xl" : "text-lg sm:text-[2rem]"}`}>
              {view === "terrain" ? elevation.toFixed(1) : formatDepthCm(depth)}
            </span>
            <span className="ml-0.5 text-xs">{view === "terrain" ? "m" : "cm"}</span>
            {risk !== "SAFE" && <span className="hidden text-xs font-semibold sm:block">{RISK[risk].label}</span>}
          </span>
        </span>
      )}
    </button>
  );
});

export default function FloodGrid({ data, step, view, selectedId, onSelect, markedIds, layout = "grid" }) {
  const { rows, cols } = data.meta;
  const water = data.timeline.water_levels[step];
  const risks = data.timeline.risk_levels[step];
  const ctx = useMemo(() => {
    const e = data.city.elevation.flat();
    return { critical: data.config.critical_threshold, minElev: Math.min(...e), maxElev: Math.max(...e) };
  }, [data]);

  const useCanvas = rows * cols > CANVAS_CELL_LIMIT;
  const showText = cols <= 8 && rows <= 8;

  if (layout === "map")
    return (
      <div>
        <Suspense fallback={<div className="flex h-[360px] items-center justify-center rounded-sm bg-line/40 text-sm text-ink-soft sm:h-[460px] xl:h-[520px]">Loading the map</div>}>
          <FloodMap data={data} step={step} view={view} ctx={ctx} selectedId={selectedId} onSelect={onSelect} markedIds={markedIds} />
        </Suspense>
        <div className="mt-4 flex flex-col items-center gap-1.5">
          <Legend view={view} ctx={ctx} />
          {markedIds?.size > 0 && <p className="text-sm">Dashed green outline: drain capacity changed by an intervention in this run</p>}
        </div>
      </div>
    );

  return (
    <div>
      {useCanvas ? (
        <FloodCanvas data={data} water={water} risks={risks} view={view} ctx={ctx} selectedId={selectedId} onSelect={onSelect} markedIds={markedIds} />
      ) : (
        <div className="mx-auto grid w-full max-w-[620px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: cols > 12 ? 1 : cols > 8 ? 2 : 5 }}>
          {data.regions.map((r) => (
            <GridCell
              key={r.id}
              id={r.id}
              depth={water[r.row][r.col]}
              risk={risks[r.row][r.col]}
              elevation={r.elevation}
              view={view}
              selected={r.id === selectedId}
              marked={Boolean(markedIds?.has(r.id))}
              showText={showText}
              critical={ctx.critical}
              minElev={ctx.minElev}
              maxElev={ctx.maxElev}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
      {!showText && (
        <p className="mt-2 text-center text-sm text-ink-soft">
          {rows} x {cols} regions. Select a region to read its depth.
        </p>
      )}
      <div className="mt-4 flex flex-col items-center gap-1.5">
        <Legend view={view} ctx={ctx} />
        {markedIds?.size > 0 && (
          <p className="flex items-center gap-1.5 text-sm">
            <span className="inline-block h-0 w-0 border-l-[12px] border-t-[12px] border-l-transparent border-t-safe" aria-hidden="true" />
            Drain capacity changed by an intervention in this run
          </p>
        )}
      </div>
    </div>
  );
}
