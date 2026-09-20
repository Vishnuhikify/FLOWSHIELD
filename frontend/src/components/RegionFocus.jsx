import { lazy, Suspense } from "react";
import { RISK } from "../utils/risk";
import { formatDepth, formatMinutes } from "../utils/format";
import { regionStateAt } from "../utils/progression";

const FloodMap = lazy(() => import("./FloodMap"));

function Stat({ label, children }) {
  return (
    <div>
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** Level 2: the existing Map View, flown in on one region, with that region's current state alongside it. */
export default function RegionFocus({ data, step, view, ctx, region, markedIds, onSelect, onOpenNeighborhood }) {
  const now = regionStateAt(data, region, step);
  const { row, col } = region;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <Suspense fallback={<div className="flex h-[360px] items-center justify-center rounded-sm bg-line/40 text-sm text-ink-soft sm:h-[460px] xl:h-[520px]">Loading the map</div>}>
        <FloodMap data={data} step={step} view={view} ctx={ctx} selectedId={region.id} onSelect={onSelect} markedIds={markedIds} focusRegionId={region.id} />
      </Suspense>

      <div className="rounded-sm border border-line bg-white p-3">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-display text-2xl font-semibold">Region {region.id}</span>
          <span className={`rounded-sm px-2 py-0.5 text-sm font-semibold ${RISK[now.risk].tint} ${RISK[now.risk].text}`}>{RISK[now.risk].label}</span>
        </p>
        <p className="text-sm text-ink-soft">At {formatMinutes(data.timeline.timestamps[step])}, current modeled state</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          <Stat label="Water depth">{formatDepth(now.depth)}</Stat>
          <Stat label="Risk">{RISK[now.risk].label}</Stat>
          <Stat label="Population">{region.population.toLocaleString()}</Stat>
          <Stat label="Rainfall">{data.city.rainfall[row][col]} mm/h</Stat>
          <Stat label="Drain capacity">{data.city.drainage_capacity[row][col]} mm/h</Stat>
          <Stat label="Elevation">{region.elevation.toFixed(2)} m</Stat>
        </dl>
        <button type="button" onClick={onOpenNeighborhood} className="btn btn-primary mt-3 w-full">
          View simulated neighborhood
        </button>
      </div>
    </div>
  );
}
