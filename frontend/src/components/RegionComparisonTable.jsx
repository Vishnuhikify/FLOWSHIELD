import { useState } from "react";
import { depthChangeCm, DIRECTION, filterRegions, REGION_FILTERS, sortRegions, timeChangeText } from "../utils/comparison";
import { formatDepth, formatPeople } from "../utils/format";
import { RISK } from "../utils/risk";

const PAGE = 15;

function Risk({ level }) {
  return <span className={`rounded-sm px-1.5 text-sm font-semibold ${RISK[level].tint} ${RISK[level].text}`}>{RISK[level].label}</span>;
}

export default function RegionComparisonTable({ comparison, selectedId, onSelect }) {
  const [filter, setFilter] = useState("changed");
  const [showAll, setShowAll] = useState(false);
  const rows = sortRegions(filterRegions(comparison.regions, filter));
  const visible = showAll ? rows : rows.slice(0, PAGE);

  return (
    <div>
      <div role="radiogroup" aria-label="Region filter" className="mb-2 seg">
        {REGION_FILTERS.map((f) => (
          <button key={f.value} type="button" role="radio" aria-checked={filter === f.value} onClick={() => { setFilter(f.value); setShowAll(false); }}>
            {f.label} ({filterRegions(comparison.regions, f.value).length})
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">No regions in this group for this comparison.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-ink-soft">
                <th scope="col" className="pb-1.5 pr-3 font-medium">Region</th>
                <th scope="col" className="pb-1.5 pr-3 font-medium">Modeled change</th>
                <th scope="col" className="pb-1.5 pr-3 font-medium">Peak risk, without to with</th>
                <th scope="col" className="pb-1.5 pr-3 font-medium">Peak water, without to with</th>
                <th scope="col" className="pb-1.5 pr-3 font-medium">Critical time</th>
                <th scope="col" className="pb-1.5 text-right font-medium">People</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className={`border-t border-line ${r.id === selectedId ? "bg-white" : ""}`}>
                  <th scope="row" className="py-2 pr-3 text-left">
                    <button type="button" onClick={() => onSelect(r.id)} aria-pressed={r.id === selectedId} className="font-display text-xl font-semibold underline decoration-line underline-offset-4 hover:decoration-ink">{r.id}</button>
                  </th>
                  <td className="py-2 pr-3">
                    <span className={`font-semibold ${DIRECTION[r.status].text}`}>{DIRECTION[r.status].label}</span>
                    {r.reason && <span className="block text-ink-soft">{r.reason}</span>}
                  </td>
                  <td className="py-2 pr-3"><Risk level={r.without.peak_risk} /> <span className="text-ink-soft">to</span> <Risk level={r.with.peak_risk} /></td>
                  <td className="py-2 pr-3">
                    {formatDepth(r.without.max_water_level)} <span className="text-ink-soft">to</span> {formatDepth(r.with.max_water_level)}
                    <span className={`block ${DIRECTION[r.max_water_change < 0 ? "improved" : r.max_water_change > 0 ? "worsened" : "unchanged"].text}`}>
                      {depthChangeCm(r.max_water_change)}
                      {r.max_water_percent_change != null && r.max_water_change !== 0 && ` (${r.max_water_percent_change > 0 ? "+" : "\u2212"}${Math.abs(r.max_water_percent_change).toFixed(1)}%)`}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{timeChangeText(r.time_to_critical)}</td>
                  <td className="py-2 text-right">{formatPeople(r.population)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > PAGE && (
        <button type="button" onClick={() => setShowAll(!showAll)} className="mt-2 rounded-sm border border-line bg-white px-3 py-1.5 text-sm font-medium hover:border-ink">
          {showAll ? "Show fewer regions" : `Show all ${rows.length} regions`}
        </button>
      )}
    </div>
  );
}
