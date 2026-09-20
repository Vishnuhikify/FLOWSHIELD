import { describe, expect, it } from "vitest";
import { HISTORICAL_EVENTS } from "../../data/historicalEvents";
import {
  buildReplayForm,
  deriveModeledRainfallRate,
  eventDurationMinutes,
  eventTimestep,
  MODELED_PROFILE_LABEL,
  REPLAY_DISCLAIMER,
} from "../historicalReplay";
import { DEFAULT_FORM, TIMESTEPS, validateForm } from "../simulationRequest";

const event = HISTORICAL_EVENTS[0];

describe("historical event data", () => {
  it("stores only the documented facts, locally, with provenance", () => {
    expect(event.name).toBe("Bengaluru Flood");
    expect(event.dateLabel).toBe("September 5, 2022");
    expect(event.observedRainfallMm).toBe(131.6);
    expect(event.observedRainfallWindowHours).toBe(24);
    expect(event.affectedAreas).toEqual(["Mahadevapura", "Bellandur", "Varthur", "K R Puram", "Sarjapur"]);
    expect(event.sources.length).toBeGreaterThan(0);
    expect(event.provenanceNote).toBeTruthy();
  });
});

describe("deriveModeledRainfallRate", () => {
  it("derives one constant rate from the documented total, never an hourly series", () => {
    expect(deriveModeledRainfallRate(event)).toBeCloseTo(131.6 / 24, 2);
    expect(deriveModeledRainfallRate({ observedRainfallMm: 60, observedRainfallWindowHours: 24 })).toBe(2.5);
  });
});

describe("eventDurationMinutes", () => {
  it("converts the documented rainfall window to minutes, so the run covers the same period", () => {
    expect(eventDurationMinutes(event)).toBe(24 * 60);
    expect(eventDurationMinutes({ observedRainfallWindowHours: 6 })).toBe(360);
  });
});

describe("eventTimestep", () => {
  it("picks the largest EXISTING timestep option that divides the duration evenly, never a new one", () => {
    expect(eventTimestep(1440)).toBe(2);
    expect(TIMESTEPS).toContain(eventTimestep(1440)); // never invents a control value such as 15
  });
  it("falls back safely if nothing divides evenly", () => {
    expect(eventTimestep(7)).toBe(DEFAULT_FORM.timestep);
  });
});

describe("buildReplayForm", () => {
  it("uses the existing uniform-rainfall control at the derived rate", () => {
    const form = buildReplayForm(event);
    expect(form.rainMode).toBe("uniform");
    expect(form.uniformRate).toBeCloseTo(deriveModeledRainfallRate(event), 2);
  });
  it("runs for the event's full documented 24-hour window, with a practical existing timestep", () => {
    const form = buildReplayForm(event);
    expect(form.duration).toBe(1440);
    expect(form.timestep).toBe(2);
    expect(TIMESTEPS).toContain(form.timestep);
  });
  it("keeps the risk thresholds at the app's normal defaults", () => {
    const form = buildReplayForm(event);
    expect(form.warning).toBe(DEFAULT_FORM.warning);
    expect(form.critical).toBe(DEFAULT_FORM.critical);
  });
  it("produces a form the app's own validation accepts", () => {
    expect(validateForm(buildReplayForm(event))).toEqual([]);
  });
  it("the modeled exposure (rate x duration) corresponds to the documented total", () => {
    const form = buildReplayForm(event);
    const modeledTotalMm = form.uniformRate * (form.duration / 60);
    expect(modeledTotalMm).toBeCloseTo(event.observedRainfallMm, 0); // within 1 mm of 131.6
  });
});

describe("required wording", () => {
  it("carries the exact labels the historical UI must show", () => {
    expect(MODELED_PROFILE_LABEL).toBe("Modeled rainfall profile derived from recorded event total.");
    expect(REPLAY_DISCLAIMER).toBe("Modeled replay \u2014 not a reconstruction of historical flood depths.");
  });
});
