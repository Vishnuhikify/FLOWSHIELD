import UrgencyTag from "./UrgencyTag";
import { relativeTime } from "../utils/earlyWarning";
import { RISK } from "../utils/risk";
import { formatDepth, formatMinutes, formatPeople } from "../utils/format";
import { regionInputChange } from "../utils/interventionLab";
import { regionStateAt } from "../utils/progression";

function Stat({ label, children }) {
  return (
    <div>
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

const TREND = { rising: "Rising", falling: "Falling", steady: "Steady" };
const jump = "btn btn-ghost btn-sm ml-1.5";

/** `alert` is this region's early-warning entry, or undefined when the run keeps it safe. */
export default function RegionDetail({ data, region, step, alert, onJump }) {
  if (!region) return <p className="text-sm text-ink-soft">Select a region on the map or in the early-warning lists. Its readings follow the timeline.</p>;
  const now = regionStateAt(data, region, step);
  const { row, col } = region;
  const rate = Math.abs(now.changePerMin * 100).toFixed(1);
  const drainChange = regionInputChange(data.interventions, region.id);

  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-2">
        <span className="font-display text-2xl font-semibold">Region {region.id}</span>
        {alert && <UrgencyTag tier={alert.tier} />}
      </p>

      <div className="rounded-sm bg-ink px-3 py-2.5 text-panel">
        <p className="text-sm text-[#a9bccd]">Now, at {formatMinutes(data.timeline.timestamps[step])}</p>
        <p className="mt-0.5 flex flex-wrap items-baseline gap-x-3">
          <span className="font-display text-4xl font-bold leading-none">{formatDepth(now.depth)}</span>
          <span className={`rounded-sm px-2 py-0.5 text-sm font-semibold ${RISK[now.risk].tint} ${RISK[now.risk].text}`}>{RISK[now.risk].label}</span>
        </p>
        <p className="mt-1 text-sm">
          {TREND[now.trend]}
          {now.trend !== "steady" && ` ${rate} cm per minute`}
        </p>
      </div>

      <div>
        <p className="text-sm font-semibold">Warning forecast for this run</p>
        {alert ? (
          <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-2">
            <Stat label="First warning">
              {formatMinutes(alert.firstWarningTime)}
              <button type="button" className={jump} onClick={() => onJump(alert.firstWarningStep)}>go</button>
              <span className="block text-sm font-normal text-ink-soft">{relativeTime(alert.minutesToWarning)}</span>
            </Stat>
            <Stat label="Turns critical">
              {alert.criticalAt == null ? (
                "Not in this run"
              ) : (
                <>
                  {formatMinutes(alert.criticalAt)}
                  <button type="button" className={jump} onClick={() => onJump(alert.criticalStep)}>go</button>
                  <span className={`block text-sm ${alert.minutesToCritical > 0 ? "font-semibold text-critical" : "font-normal text-ink-soft"}`}>{relativeTime(alert.minutesToCritical)}</span>
                </>
              )}
            </Stat>
            <Stat label="Warning to critical">{alert.leadMinutes == null ? "-" : `${formatMinutes(alert.leadMinutes)} to act`}</Stat>
            <Stat label="Peak water">
              {formatDepth(alert.peakDepth)}
              <span className="block text-sm font-normal text-ink-soft">at {formatMinutes(alert.peakTime)}</span>
            </Stat>
          </dl>
        ) : (
          <p className="mt-1 text-sm text-ink-soft">Under this simulation this region stays below the warning depth. Peak water {formatDepth(region.max_water_level)}.</p>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold">Region</p>
        <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-2">
          <Stat label="Residents">{formatPeople(region.population)}</Stat>
          <Stat label="Elevation">{region.elevation.toFixed(2)} m</Stat>
          <Stat label="Rainfall">{data.city.rainfall[row][col]} mm/h</Stat>
          <Stat label="Drain capacity">
            {data.city.drainage_capacity[row][col]} mm/h
            {drainChange && <span className="block text-sm font-normal text-safe">Intervention: {drainChange.before} to {drainChange.after} {drainChange.unit}</span>}
          </Stat>
        </dl>
      </div>
    </div>
  );
}
