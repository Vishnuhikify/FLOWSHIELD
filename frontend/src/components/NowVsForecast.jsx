import { formatMinutes, formatPeople, percent } from "../utils/format";

function Row({ label, pair, tone, people }) {
  const share = Math.min(100, percent(pair.now, Math.max(pair.now, pair.forecast)));
  const fmt = people ? formatPeople : (n) => n;
  return (
    <tr className="border-t border-line">
      <th scope="row" className="py-2 pr-3 text-left font-medium">{label}</th>
      <td className="py-2 pr-3">
        <span className="font-display text-2xl font-semibold">{fmt(pair.now)}</span>
        <span className="mt-0.5 block h-1.5 w-full max-w-36 rounded-sm bg-line/60" aria-hidden="true">
          <span className={`block h-full rounded-sm ${tone}`} style={{ width: `${share}%` }} />
        </span>
      </td>
      <td className="py-2 font-display text-2xl font-semibold text-ink-soft">{fmt(pair.forecast)}</td>
    </tr>
  );
}

/** People and regions: what is true at this timestep next to what the run forecasts. */
export default function NowVsForecast({ numbers, time, duration }) {
  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-ink-soft">
            <td />
            <th scope="col" className="pb-1 pr-3 font-medium">
              <span className="rounded-sm bg-ink px-1.5 py-0.5 text-panel">Now, at {formatMinutes(time)}</span>
            </th>
            <th scope="col" className="pb-1 font-medium">Forecast for this run</th>
          </tr>
        </thead>
        <tbody>
          <Row label="People affected" pair={numbers.affectedPeople} tone="bg-ink" people />
          <Row label="People in critical regions" pair={numbers.criticalPeople} tone="bg-critical" people />
          <Row label="People in warning regions" pair={numbers.warningPeople} tone="bg-warning-fill" people />
          <Row label="Critical regions" pair={numbers.criticalRegions} tone="bg-critical" />
          <Row label="Warning regions" pair={numbers.warningRegions} tone="bg-warning-fill" />
        </tbody>
      </table>
      <p className="mt-2 text-sm text-ink-soft">
        Forecast counts each region once, under the worst level it reaches within {formatMinutes(duration)} if conditions stay unchanged. A region can be at warning now
        and critical in the forecast.
      </p>
    </div>
  );
}
