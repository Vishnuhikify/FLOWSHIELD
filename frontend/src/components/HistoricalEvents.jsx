import Panel from "./Panel";
import { deriveModeledRainfallRate, eventDurationMinutes, eventTimestep, MODELED_PROFILE_LABEL, REPLAY_DISCLAIMER } from "../utils/historicalReplay";

function Stat({ label, children }) {
  return (
    <div>
      <dt className="text-sm text-ink-soft">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function EventCard({ event, active, disabled, onReplay }) {
  const rate = deriveModeledRainfallRate(event);
  const duration = eventDurationMinutes(event);
  const timestep = eventTimestep(duration);
  return (
    <article className="rounded-sm border border-line bg-white p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <p className="font-display text-2xl font-semibold leading-tight">{event.name}</p>
          <p className="text-sm text-ink-soft">{event.dateLabel}</p>
        </div>
        {active && <span className="rounded-sm bg-water px-2 py-0.5 text-sm font-semibold text-white">Replayed in current results</span>}
      </header>

      {/* OBSERVED HISTORICAL DATA — kept visually and textually separate from anything modeled below. */}
      <section aria-label="Observed historical data" className="mt-3 rounded-sm border border-line bg-panel p-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Observed historical data</p>
        <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          <Stat label="Date">{event.dateLabel}</Stat>
          <Stat label="Observed rainfall">
            {event.observedRainfallMm} mm over {event.observedRainfallWindowHours} h
          </Stat>
          <Stat label="Reported affected areas">{event.affectedAreas.join(", ")}</Stat>
        </dl>
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer font-semibold">Sources</summary>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft">
            {event.sources.map((s) => (
              <li key={s.label}>
                {s.url ? (
                  <a className="font-medium text-water underline" href={s.url} target="_blank" rel="noreferrer">
                    {s.label}
                  </a>
                ) : (
                  <span className="font-medium text-ink">{s.label}</span>
                )}
                . {s.detail}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-ink-soft">{event.provenanceNote}</p>
        </details>
      </section>

      {/* MODELED SIMULATION RESULTS — what replaying the event actually does, kept apart from the facts above. */}
      <section aria-label="Modeled simulation setup" className="mt-3 rounded-sm border border-water/40 bg-[#e3eef8] p-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-water">Modeled simulation results</p>
        <p className="mt-1 text-sm">
          {MODELED_PROFILE_LABEL} {event.observedRainfallMm} mm over {event.observedRainfallWindowHours} h is applied as a constant
          modeled rate of <span className="font-semibold">{rate} mm/h</span> across the whole simulated city, run for the full{" "}
          {duration / 60} h (a {timestep} min timestep) so the modeled exposure corresponds to the documented total. No hour-by-hour
          rainfall figures for this event are recorded or invented.
        </p>
        <p role="note" className="mt-2 text-sm font-semibold text-warning">
          {REPLAY_DISCLAIMER}
        </p>
      </section>

      <button type="button" onClick={() => onReplay(event)} disabled={disabled} className="btn btn-primary btn-lg mt-3">
        Replay Historical Event
      </button>
    </article>
  );
}

export default function HistoricalEvents({ events, activeEventId, disabled, onReplay }) {
  return (
    <Panel id="historical" title="Historical events" aside="Documented event facts, stored locally, used only to set a modeled rainfall rate">
      <p className="text-sm text-ink-soft">
        FLOWSHIELD does not reconstruct any historical flood. Replaying an event only sets the simulation&rsquo;s rainfall control from the
        documented rainfall total and runs the same simulation engine used everywhere else in the app.
      </p>
      <div className="mt-3 space-y-4">
        {events.map((event) => (
          <EventCard key={event.id} event={event} active={event.id === activeEventId} disabled={disabled} onReplay={onReplay} />
        ))}
      </div>
    </Panel>
  );
}
