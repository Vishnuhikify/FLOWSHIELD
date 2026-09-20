import { useMemo } from "react";
import TimelineControls from "./TimelineControls";
import { formatDepth, formatMinutes } from "../utils/format";
import { buildNeighborhoodLayout, neighborhoodWaterFraction } from "../utils/neighborhood";
import { regionStateAt } from "../utils/progression";
import { RISK } from "../utils/risk";

/** Level 3: an illustrative neighborhood tile whose water overlay is driven by the EXISTING simulation
 *  result at the current timestep. No separate flood calculation is performed here. */
export default function NeighborhoodView({ data, step, region, playback, onOpenIntervention }) {
  const now = regionStateAt(data, region, step);
  const layout = useMemo(() => buildNeighborhoodLayout(region.id), [region.id]);
  const fraction = neighborhoodWaterFraction(now.depth, data.config.critical_threshold);
  const waterY = 100 - fraction * 55; // water rises from the low area upward as depth increases
  const riskFill = RISK[now.risk].hex;

  return (
    <div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="rounded-sm border border-line bg-[#eef2f0] p-2">
          <svg viewBox={layout.viewBox} className="mx-auto block w-full max-w-[520px]" role="img" aria-label={`Illustrative neighborhood layout for region ${region.id}`}>
            <rect x="0" y="0" width="100" height="100" fill="#e4ece6" />
            {/* low-lying illustrative area, where modeled water is shown collecting first */}
            <ellipse cx={layout.lowArea.cx} cy={layout.lowArea.cy} rx={layout.lowArea.rx} ry={layout.lowArea.ry} fill="#d6e2da" />
            {layout.roads.map((r, i) => (
              <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} stroke="#b7c2ca" strokeWidth="3" strokeLinecap="round" />
            ))}
            {layout.buildings.map((b) => (
              <rect key={b.id} x={b.x} y={b.y} width={b.w} height={b.h} rx="1" fill="#c9cfa4" stroke="#8a6f4d" strokeWidth="0.5" transform={`rotate(${b.rotate} ${b.x + b.w / 2} ${b.y + b.h / 2})`} />
            ))}
            {/* modeled water overlay: height only, driven by the existing depth at this timestep */}
            <clipPath id={`low-${region.id}`}>
              <ellipse cx={layout.lowArea.cx} cy={layout.lowArea.cy} rx={layout.lowArea.rx} ry={layout.lowArea.ry} />
            </clipPath>
            <g clipPath={`url(#low-${region.id})`}>
              <rect x="0" y={waterY} width="100" height={100 - waterY} fill={riskFill} opacity={fraction > 0 ? 0.75 : 0} />
            </g>
            {layout.drains.map((d) => (
              <circle key={d.id} cx={d.x} cy={d.y} r="1.6" fill="#1f5f9e" stroke="#0b2f5c" strokeWidth="0.4" />
            ))}
          </svg>
          <p className="mt-1 text-center text-sm font-semibold">Illustrative simulated neighborhood — not real flood geometry.</p>
        </div>

        <div className="rounded-sm border border-line bg-white p-3">
          <p className="font-display text-2xl font-semibold">Region {region.id}</p>
          <p className="text-sm text-ink-soft">Modeled flood progression — not live sensor data.</p>
          <dl className="mt-3 space-y-2">
            <div>
              <dt className="text-sm text-ink-soft">Simulation time</dt>
              <dd className="font-display text-3xl font-bold leading-none">{formatMinutes(data.timeline.timestamps[step])}</dd>
            </div>
            <div>
              <dt className="text-sm text-ink-soft">Modeled water depth</dt>
              <dd className={`font-display text-2xl font-semibold ${RISK[now.risk].text}`}>{formatDepth(now.depth)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-ink-soft">
            Roads, buildings and drains shown here are illustrative only. Only the water level comes from the real simulation result for
            this region and timestep.
          </p>
          {onOpenIntervention && (
            <button type="button" onClick={onOpenIntervention} className="btn btn-ghost mt-3 w-full">
              Open the Intervention lab
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 border-t border-line pt-4">
        <TimelineControls playback={playback} timeline={data.timeline} />
      </div>
    </div>
  );
}
