import { formatMinutes } from "../utils/format";

const MAX_CHIPS = 18;

function Chips({ items, empty, className, onSelect, selectedId, suffix }) {
  if (items.length === 0) return <p className="text-sm text-ink-soft">{empty}</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.slice(0, MAX_CHIPS).map((a) => (
        <li key={a.id}>
          <button type="button" onClick={() => onSelect(a.id)} aria-pressed={a.id === selectedId} className={`rounded-sm border px-2 py-0.5 text-sm font-semibold ${className} ${a.id === selectedId ? "outline outline-2 outline-ink" : ""}`}>
            {a.id}
            {suffix && <span className="ml-1 font-normal">{suffix(a)}</span>}
          </button>
        </li>
      ))}
      {items.length > MAX_CHIPS && <li className="self-center text-sm text-ink-soft">and {items.length - MAX_CHIPS} more</li>}
    </ul>
  );
}

/** Which regions are warning / critical right now, and which the run forecasts to turn critical. */
export default function RegionGroups({ groups, time, selectedId, onSelect }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-sm">
          <span className="rounded-sm bg-ink px-1.5 py-0.5 font-medium text-panel">Now, at {formatMinutes(time)}</span>
        </p>
        <p className="mb-1 text-sm font-semibold">Critical regions ({groups.criticalNow.length})</p>
        <Chips items={groups.criticalNow} empty="None at this moment." className="border-critical bg-critical text-white" onSelect={onSelect} selectedId={selectedId} />
        <p className="mb-1 mt-3 text-sm font-semibold">Warning regions ({groups.warningNow.length})</p>
        <Chips items={groups.warningNow} empty="None at this moment." className="border-warning-fill bg-warning-tint text-warning" onSelect={onSelect} selectedId={selectedId} />
      </div>
      <div className="border-t border-line pt-3">
        <p className="mb-1 text-sm font-semibold">Forecast to turn critical in this run ({groups.forecastCritical.length})</p>
        <Chips
          items={groups.forecastCritical}
          empty="None under this simulation."
          className="border-critical bg-white text-critical"
          onSelect={onSelect}
          selectedId={selectedId}
          suffix={(a) => `at ${formatMinutes(a.criticalAt)}`}
        />
      </div>
    </div>
  );
}
