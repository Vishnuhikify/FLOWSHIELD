import ComparisonCards from "./ComparisonCards";
import ComparisonChart from "./ComparisonChart";
import RegionChangeMap from "./RegionChangeMap";
import RegionComparisonTable from "./RegionComparisonTable";
import { DIRECTION, headline, timeChangeText, timePair } from "../utils/comparison";
import { changeLines, describePlanItem } from "../utils/interventions";
import { formatPeople } from "../utils/format";

const TONE = { improved: "border-safe bg-safe-tint", worsened: "border-critical bg-critical-tint", mixed: "border-warning-fill bg-warning-tint", unchanged: "border-line bg-white" };
const MAX_IDS = 24;
const ids = (list) => (list.length > MAX_IDS ? `${list.slice(0, MAX_IDS).join(", ")} and ${list.length - MAX_IDS} more` : list.join(", "));

function RegionList({ title, list, empty, tone }) {
  return (
    <div>
      <dt className="text-sm font-semibold">{title} ({list.length})</dt>
      <dd className={list.length > 0 ? `font-medium ${tone}` : "text-sm text-ink-soft"}>{list.length > 0 ? ids(list) : empty}</dd>
    </div>
  );
}

function Frame({ children, aside }) {
  return (
    <section id="modeled-impact" data-section aria-labelledby="modeled-impact-title" className="rounded-sm border-2 border-ink bg-panel">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 bg-ink px-4 py-2.5 text-panel">
        <h2 id="modeled-impact-title" className="font-display text-2xl font-bold tracking-[0.06em]">MODELED IMPACT</h2>
        <p className="text-sm text-[#c9d6e2]">{aside}</p>
      </header>
      <div className="space-y-5 p-4">{children}</div>
    </section>
  );
}

export default function ComparisonDashboard({ comparison, status, error, stale, canCompare, onCompare, interventionCatalog, selectedId, onSelect }) {
  const loading = status === "loading";
  const compareButton = (label) => (
    <button type="button" onClick={onCompare} disabled={loading || !canCompare}
      className="btn btn-ink btn-lg">
      {loading && <span className="fs-spinner inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
      {loading ? "Comparing" : label}
    </button>
  );

  if (!comparison)
    return (
      <Frame aside="Same scenario, without and with the intervention plan">
        {error && <p role="alert" className="text-critical">Comparison not run. {error.message}{error.details?.length > 0 && ` (${error.details.map((d) => `${d.field}: ${d.message}`).join("; ")})`}</p>}
        <p>
          Compares one scenario run twice through the same simulation engine: once without interventions and once with the plan from the Intervention lab.
          {!canCompare && " Add at least one intervention to the plan to compare."}
        </p>
        {compareButton("Compare without and with the plan")}
      </Frame>
    );

  const s = comparison.region_summary;
  const head = headline(comparison);
  const specOf = (id) => interventionCatalog?.interventions.find((i) => i.id === id);
  const sc = comparison.scenario;

  return (
    <Frame aside={`${sc.is_baseline ? "Baseline" : `Scenario: ${sc.name}`}, without and with ${comparison.interventions.count} intervention${comparison.interventions.count === 1 ? "" : "s"}`}>
      <div className={loading ? "space-y-5 opacity-50" : "space-y-5"} aria-busy={loading}>
        <p className="text-sm">{comparison.label} {comparison.meta.disclaimer}</p>

        {error && <p role="alert" className="text-critical">Comparison not updated. {error.message}</p>}
        {stale && (
          <div className="flex flex-wrap items-center gap-3 rounded-sm border border-warning-fill bg-warning-tint px-3 py-2">
            <p className="text-sm font-medium text-warning">The scenario, controls or plan changed since this comparison was made.</p>
            {compareButton("Compare again")}
          </div>
        )}

        <div className={`rounded-sm border-l-8 px-4 py-3 ${TONE[head.tone]}`}>
          <p className="font-display text-xl font-semibold">Modeled result</p>
          <p>{head.text}</p>
        </div>

        <div className="grid gap-x-8 gap-y-3 text-sm md:grid-cols-2">
          <div>
            <p className="font-semibold">Both runs share</p>
            <p>{sc.is_baseline ? "The baseline city, no scenario changes." : `Scenario ${sc.name}: ${sc.description}`}</p>
            <p className="text-ink-soft">{comparison.config.duration_minutes} min at {comparison.config.timestep_minutes} min steps, warning at {comparison.config.warning_threshold} m, critical at {comparison.config.critical_threshold} m.</p>
          </div>
          <div>
            <p className="font-semibold">Only the second run adds</p>
            <ol>
              {comparison.interventions.items.map((item, i) => (
                <li key={i}>
                  <span className="font-medium">{i + 1}. {describePlanItem(item, specOf(item.id))}</span>
                  <span className="block text-ink-soft">{changeLines(item, 3).join("; ")}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div>
          <h3 className="h-sub mb-2">Without plan and with plan</h3>
          <ComparisonCards comparison={comparison} />
          <p className="mt-2 text-sm text-ink-soft">Bars show the two values on a shared scale: grey without the plan, coloured with it. Change is with minus without.</p>
        </div>

        <div className="grid gap-x-8 gap-y-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <ComparisonChart comparison={comparison} />

          <div>
            <h3 className="h-sub mb-2">Regions</h3>
            <p className="mb-2">
              <span className={`font-semibold ${DIRECTION.improved.text}`}>{s.improved_count} improved</span> ({formatPeople(s.improved_population)} people),{" "}
              <span className="font-semibold">{s.unchanged_count} unchanged</span>,{" "}
              <span className={`font-semibold ${s.worsened_count > 0 ? DIRECTION.worsened.text : ""}`}>{s.worsened_count} worsened</span>
              {s.worsened_count > 0 && ` (${formatPeople(s.worsened_population)} people)`}.
            </p>
            <RegionChangeMap comparison={comparison} selectedId={selectedId} onSelect={onSelect} />
          </div>
        </div>

        <dl className="grid gap-x-8 gap-y-3 md:grid-cols-2">
          <RegionList title="No longer critical with the plan" list={s.no_longer_critical} empty="None." tone={DIRECTION.improved.text} />
          <RegionList title="Newly critical with the plan" list={s.newly_critical} empty="None." tone={DIRECTION.worsened.text} />
          <RegionList title="No longer at warning or critical" list={s.no_longer_at_risk} empty="None." tone={DIRECTION.improved.text} />
          <RegionList title="Newly at warning or critical" list={s.newly_at_risk} empty="None." tone={DIRECTION.worsened.text} />
        </dl>

        <div>
          <h3 className="h-sub mb-2">Time-to-critical changes</h3>
          {comparison.time_to_critical.length === 0 ? (
            <p className="text-sm text-ink-soft">No region turns critical in either run.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {comparison.time_to_critical.slice(0, 12).map((t) => {
                const pair = timePair(t);
                return (
                  <li key={t.id} className="rounded-sm border border-line bg-white px-3 py-2">
                    <p className="flex items-baseline justify-between gap-2">
                      <span className="font-display text-xl font-semibold">{t.id}</span>
                      <span className="text-sm text-ink-soft">{formatPeople(t.population)} people</span>
                    </p>
                    <p className="text-sm">{pair.without} without, {pair.with} with</p>
                    <p className={`text-sm font-semibold ${DIRECTION[t.direction].text}`}>{timeChangeText(t)}</p>
                  </li>
                );
              })}
            </ul>
          )}
          {comparison.time_to_critical.length > 12 && <p className="mt-2 text-sm text-ink-soft">Showing 12 of {comparison.time_to_critical.length}. The region table below has every region.</p>}
        </div>

        <div>
          <h3 className="h-sub mb-2">Region-level comparison</h3>
          <RegionComparisonTable comparison={comparison} selectedId={selectedId} onSelect={onSelect} />
          <p className="mt-2 text-sm text-ink-soft">
            A region's change is judged by peak risk level first, then critical timing, then peak depth, then final depth. Depth differences under {comparison.water_tolerance_m * 1000} mm count as no change.
          </p>
        </div>

        {!stale && <div>{compareButton("Compare again")}</div>}
      </div>
    </Frame>
  );
}
