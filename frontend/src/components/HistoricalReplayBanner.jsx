import { HISTORICAL_EVENTS } from "../data/historicalEvents";
import { deriveModeledRainfallRate, MODELED_PROFILE_LABEL, REPLAY_DISCLAIMER } from "../utils/historicalReplay";

/** Shown above the results only while they come from a historical replay. Clears on any other run. */
export default function HistoricalReplayBanner({ eventId }) {
  const event = HISTORICAL_EVENTS.find((e) => e.id === eventId);
  if (!event) return null;
  return (
    <section aria-label="Historical replay context" className="rounded-sm border border-water bg-[#e3eef8] px-4 py-3">
      <p className="text-sm text-ink-soft">Results shown for a replay of</p>
      <p className="font-display text-2xl font-bold leading-tight">
        {event.name}, {event.dateLabel}
      </p>
      <p className="mt-1 text-sm">
        {MODELED_PROFILE_LABEL} Modeled rate: {deriveModeledRainfallRate(event)} mm/h, from the documented {event.observedRainfallMm} mm
        over {event.observedRainfallWindowHours} h.
      </p>
      <p role="note" className="mt-1 text-sm font-semibold text-warning">{REPLAY_DISCLAIMER}</p>
    </section>
  );
}
