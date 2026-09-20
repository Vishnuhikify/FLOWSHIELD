import { formatDepth, formatMinutes, formatPeople, percent } from "../utils/format";

/* Visual weight follows severity: critical is a solid block, warning a tinted block,
   everything else is quiet. */
function Card({ className, label, value, children }) {
  return (
    <div className={`rounded-sm px-4 py-3 ${className}`}>
      <p className="text-sm font-medium opacity-90">{label}</p>
      <p className="mt-1 font-display text-4xl font-bold leading-none sm:text-5xl">{value}</p>
      <p className="mt-1.5 text-sm">{children}</p>
    </div>
  );
}

/** END-OF-RUN forecast: the worst each region reaches over the whole simulation. */
export default function SummaryCards({ summary }) {
  const s = summary;
  const anyCritical = s.critical_region_count > 0;
  return (
    <section aria-labelledby="forecast-heading">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <h2 id="forecast-heading" className="font-display text-xl font-semibold tracking-wide">
          Forecast for the full {formatMinutes(s.duration_minutes)} run
        </h2>
        <p className="text-sm text-ink-soft">Worst level each region reaches by the end if nothing changes. These numbers do not move with the timeline.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card className={`col-span-2 lg:col-span-1 ${anyCritical ? "bg-critical text-white" : "border border-line bg-panel"}`} label="Regions reaching critical" value={s.critical_region_count}>
          {anyCritical ? `${formatPeople(s.critical_population)} people in critical flooding` : "No region reaches critical depth"}
        </Card>
        <Card className={s.warning_region_count > 0 ? "border border-warning-fill bg-warning-tint text-warning" : "border border-line bg-panel"} label="Regions reaching warning" value={s.warning_region_count}>
          {formatPeople(s.warning_population)} people
        </Card>
        <Card className="border border-line bg-panel" label="People affected" value={formatPeople(s.affected_population)}>
          {percent(s.affected_population, s.total_population)}% of {formatPeople(s.total_population)} residents
        </Card>
        <Card className="border border-line bg-panel" label="First critical" value={s.earliest_critical_time == null ? "None" : formatMinutes(s.earliest_critical_time)}>
          {s.earliest_critical_region ? `Region ${s.earliest_critical_region} floods first` : `Within ${formatMinutes(s.duration_minutes)}`}
        </Card>
        <Card className="border border-line bg-panel" label="Peak water" value={formatDepth(s.max_water_level)}>
          Region {s.max_water_region}
        </Card>
      </div>
    </section>
  );
}
