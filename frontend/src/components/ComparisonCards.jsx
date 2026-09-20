import { barShares, CARD_KEYS, DIRECTION, formatChange, formatMetricValue, metricLabel, metricsByKey, timeChangeText, timePair } from "../utils/comparison";

function DirectionTag({ direction }) {
  const d = DIRECTION[direction];
  return <span className={`rounded-sm border border-current px-1.5 py-0.5 text-sm font-semibold ${d.text}`}>{d.label}</span>;
}

function Pair({ without, withPlan }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-3">
      <div>
        <p className="text-sm text-ink-soft">Without plan</p>
        <p className="font-display text-3xl font-bold leading-none">{without}</p>
      </div>
      <div>
        <p className="text-sm text-ink-soft">With plan</p>
        <p className="font-display text-3xl font-bold leading-none">{withPlan}</p>
      </div>
    </div>
  );
}

function MetricCard({ metric, regionCount }) {
  const shares = barShares(metric);
  return (
    <article className="rounded-sm border border-line bg-white px-4 py-3">
      <header className="flex items-start justify-between gap-2">
        <h4 className="font-medium">{metricLabel(metric)}</h4>
        <DirectionTag direction={metric.direction} />
      </header>
      <Pair without={formatMetricValue(metric, metric.without, regionCount)} withPlan={formatMetricValue(metric, metric.with, regionCount)} />
      {/* concise chart: the two values as bars on a shared scale */}
      <div className="mt-2 space-y-1" aria-hidden="true">
        <div className="h-2 rounded-sm bg-line/50"><div className="h-full rounded-sm bg-ink-soft" style={{ width: `${shares.without}%` }} /></div>
        <div className="h-2 rounded-sm bg-line/50"><div className={`h-full rounded-sm ${DIRECTION[metric.direction].bar}`} style={{ width: `${shares.with}%` }} /></div>
      </div>
      <p className={`mt-2 text-sm font-semibold ${DIRECTION[metric.direction].text}`}>{formatChange(metric, regionCount)}</p>
      {metric.note && <p className="mt-1 text-sm text-ink-soft">{metric.note}</p>}
    </article>
  );
}

function TimeCard({ earliest }) {
  const pair = timePair(earliest);
  return (
    <article className="rounded-sm border border-line bg-white px-4 py-3">
      <header className="flex items-start justify-between gap-2">
        <h4 className="font-medium">Earliest critical time</h4>
        <DirectionTag direction={earliest.direction} />
      </header>
      <Pair without={pair.without} withPlan={pair.with} />
      <p className={`mt-2 text-sm font-semibold ${DIRECTION[earliest.direction].text}`}>{timeChangeText(earliest)}</p>
      <p className="mt-1 text-sm text-ink-soft">
        {earliest.region_without ? `First region without the plan: ${earliest.region_without}.` : "No region turns critical without the plan."}{" "}
        {earliest.region_with ? `With the plan: ${earliest.region_with}.` : "With the plan no region turns critical."}
      </p>
    </article>
  );
}

export default function ComparisonCards({ comparison }) {
  const byKey = metricsByKey(comparison);
  const regionCount = comparison.meta.rows * comparison.meta.cols;
  const [first, ...rest] = CARD_KEYS.filter((k) => byKey[k]);
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard metric={byKey[first]} regionCount={regionCount} />
      <TimeCard earliest={comparison.earliest_critical} />
      {rest.map((k) => (
        <MetricCard key={k} metric={byKey[k]} regionCount={regionCount} />
      ))}
    </div>
  );
}
