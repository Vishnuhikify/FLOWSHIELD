// Historical Flood Replay: turns one documented event into the EXISTING simulation controls.
// This module derives a rainfall number and builds a form; it never touches the simulation engine and
// never invents an hourly rainfall profile — only a single constant rate derived from the documented total.
import { DEFAULT_FORM, TIMESTEPS } from "./simulationRequest";

export const MODELED_PROFILE_LABEL = "Modeled rainfall profile derived from recorded event total.";
export const REPLAY_DISCLAIMER = "Modeled replay \u2014 not a reconstruction of historical flood depths.";

/**
 * The engine takes one constant rainfall rate per run (see backend/app/simulation/README.md); it has no
 * time-varying rainfall input. So the only honest "profile" FLOWSHIELD can derive from a 24-hour total is
 * a single constant rate: total / hours. This is explicitly labelled wherever it is shown, and no
 * hour-by-hour figure is invented anywhere in the app.
 */
export function deriveModeledRainfallRate(event) {
  return Math.round((event.observedRainfallMm / event.observedRainfallWindowHours) * 100) / 100;
}

/** The event's documented rainfall window, in minutes - so the modeled run covers the same period the
 *  total was recorded over (131.6 mm across the full 24 h, not condensed into a shorter run). */
export function eventDurationMinutes(event) {
  return event.observedRainfallWindowHours * 60;
}

/** The largest of the app's EXISTING timestep options that divides the event duration evenly. A 24 h
 *  replay needs a coarser step than the app's usual short runs; 15 minutes would be a natural choice but
 *  is not one of the existing timestep controls (TIMESTEPS in simulationRequest.js), and this fix must not
 *  add one - so the closest supported option is used instead (fewer, more practical steps for a long run). */
export function eventTimestep(durationMinutes) {
  const bySizeDesc = [...TIMESTEPS].sort((a, b) => b - a);
  return bySizeDesc.find((t) => durationMinutes % t === 0) ?? DEFAULT_FORM.timestep;
}

/** Simulation-controls form for replaying an event: the existing uniform-rainfall mode at the derived
 *  rate, run for the event's full documented window so the total modeled exposure (rate x duration)
 *  corresponds to the documented rainfall total. Thresholds are left at the app's normal defaults.
 *  No new control is introduced - duration and timestep are both existing, validated controls. */
export function buildReplayForm(event) {
  const duration = eventDurationMinutes(event);
  return { ...DEFAULT_FORM, rainMode: "uniform", uniformRate: deriveModeledRainfallRate(event), duration, timestep: eventTimestep(duration) };
}
