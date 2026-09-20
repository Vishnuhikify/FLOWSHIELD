import UrgencyTag from "./UrgencyTag";
import { relativeTime } from "../utils/earlyWarning";
import { formatDepth, formatMinutes, formatPeople } from "../utils/format";
import { RISK } from "../utils/risk";

const MAX_ROWS = 10;
const jump = "btn btn-ghost btn-sm";

/** Highest-risk regions, most urgent first. Urgency and "now" move with the timeline; the times are forecast. */
export default function WarningTable({ alerts, selectedId, onSelect, onJump }) {
  if (alerts.length === 0) return <p className="text-sm text-ink-soft">Under this simulation no region reaches the warning depth, so there is nothing to rank.</p>;
  const rows = alerts.slice(0, MAX_ROWS);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="text-left text-ink-soft">
            <th scope="col" className="pb-1.5 pr-3 font-medium">Region</th>
            <th scope="col" className="pb-1.5 pr-3 font-medium">Urgency now</th>
            <th scope="col" className="pb-1.5 pr-3 font-medium">Water now</th>
            <th scope="col" className="pb-1.5 pr-3 font-medium">First warning</th>
            <th scope="col" className="pb-1.5 pr-3 font-medium">Turns critical</th>
            <th scope="col" className="pb-1.5 pr-3 text-right font-medium">People</th>
            <th scope="col" className="pb-1.5 text-right font-medium">Peak</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className={`border-t border-line ${a.id === selectedId ? "bg-white" : ""}`}>
              <th scope="row" className="py-2 pr-3 text-left">
                <button type="button" onClick={() => onSelect(a.id)} aria-pressed={a.id === selectedId} className="font-display text-xl font-semibold underline decoration-line underline-offset-4 hover:decoration-ink">
                  {a.id}
                </button>
              </th>
              <td className="py-2 pr-3"><UrgencyTag tier={a.tier} /></td>
              <td className="py-2 pr-3">
                <span className={`font-semibold ${RISK[a.now.risk].text}`}>{formatDepth(a.now.depth)}</span>
                <span className="block text-ink-soft">{a.now.trend}</span>
              </td>
              <td className="py-2 pr-3">
                {formatMinutes(a.firstWarningTime)} <button type="button" className={jump} onClick={() => onJump(a.firstWarningStep, a.id)} aria-label={`Jump to ${a.id} first warning`}>go</button>
                <span className="block text-ink-soft">{relativeTime(a.minutesToWarning)}</span>
              </td>
              <td className="py-2 pr-3">
                {a.criticalAt == null ? (
                  <span className="text-ink-soft">Not in this run</span>
                ) : (
                  <>
                    {formatMinutes(a.criticalAt)} <button type="button" className={jump} onClick={() => onJump(a.criticalStep, a.id)} aria-label={`Jump to ${a.id} turning critical`}>go</button>
                    <span className={`block ${a.minutesToCritical > 0 ? "font-semibold text-critical" : "text-ink-soft"}`}>{relativeTime(a.minutesToCritical)}</span>
                  </>
                )}
              </td>
              <td className="py-2 pr-3 text-right">{formatPeople(a.population)}</td>
              <td className="py-2 text-right">{formatDepth(a.peakDepth)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {alerts.length > MAX_ROWS && <p className="mt-2 text-sm text-ink-soft">Showing the {MAX_ROWS} most urgent of {alerts.length} regions that leave the safe range in this run.</p>}
    </div>
  );
}
