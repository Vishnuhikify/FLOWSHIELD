import { describe, expect, it } from "vitest";
import { BASELINE_ID, buildScenarioPayload, changeSummary, defaultParams, formatParam, isStale, selectScenario, validateScenarioParams } from "../scenarios";
import { buildRequest, DEFAULT_FORM } from "../simulationRequest";

const rain = { name: "rainfall_multiplier", label: "Rainfall multiplier", kind: "number", default: 1.3, minimum: 0, maximum: 5, step: 0.05, unit: "x" };
const heavy = { id: "heavy_rainfall", name: "Heavy rainfall", params: [rain] };
const blocked = {
  id: "blocked_channel",
  params: [
    { name: "channel_remaining", label: "Channel capacity remaining", kind: "number", default: 0, minimum: 0, maximum: 100, unit: "%" },
    { name: "channel_cells", label: "Channel regions", kind: "cells", default: null },
    { ...rain, default: 1 },
  ],
};
const baseline = { id: BASELINE_ID, params: [] };

describe("scenario selection", () => {
  it("starts from the catalogue defaults and skips non-numeric parameters", () => {
    expect(defaultParams(heavy)).toEqual({ rainfall_multiplier: 1.3 });
    expect(defaultParams(blocked)).toEqual({ channel_remaining: 0, rainfall_multiplier: 1 });
    expect(selectScenario(baseline)).toEqual({ id: "baseline", params: {} });
  });
  it("validates against the catalogue's ranges", () => {
    expect(validateScenarioParams(heavy, { rainfall_multiplier: 2 })).toEqual([]);
    expect(validateScenarioParams(heavy, { rainfall_multiplier: 6 })).toHaveLength(1);
    expect(validateScenarioParams(heavy, { rainfall_multiplier: "" })).toHaveLength(1);
    expect(validateScenarioParams(baseline, {})).toEqual([]);
  });
});

describe("request building", () => {
  it("baseline sends no scenario, so the request is identical to the default simulation", () => {
    expect(buildScenarioPayload(selectScenario(baseline))).toBeUndefined();
    expect(buildRequest(DEFAULT_FORM, null, buildScenarioPayload(selectScenario(baseline)))).toEqual(buildRequest(DEFAULT_FORM, null));
    expect("scenario" in buildRequest(DEFAULT_FORM, null, undefined)).toBe(false);
  });
  it("sends the scenario id and the edited parameters", () => {
    const payload = buildScenarioPayload({ id: "heavy_rainfall", params: { rainfall_multiplier: 1.75 } });
    expect(buildRequest(DEFAULT_FORM, null, payload).scenario).toEqual({ id: "heavy_rainfall", params: { rainfall_multiplier: 1.75 } });
  });
  it("keeps the simulation controls alongside the scenario", () => {
    const body = buildRequest({ ...DEFAULT_FORM, rainMode: "uniform", uniformRate: 40, duration: 90 }, null, { id: "extreme_rainfall", params: {} });
    expect(body).toMatchObject({ rainfall: 40, config: { duration_minutes: 90 }, scenario: { id: "extreme_rainfall" } });
  });
});

describe("isStale", () => {
  const shown = { id: "heavy_rainfall", params: { rainfall_multiplier: 1.3 } };
  it("is false when the selection produced the results", () => expect(isStale({ id: "heavy_rainfall", params: { rainfall_multiplier: 1.3 } }, shown)).toBe(false));
  it("is true for another scenario or an edited parameter", () => {
    expect(isStale({ id: "baseline", params: {} }, shown)).toBe(true);
    expect(isStale({ id: "heavy_rainfall", params: { rainfall_multiplier: 2 } }, shown)).toBe(true);
  });
  it("ignores server-resolved parameters the UI does not edit", () => {
    const result = { id: "blocked_channel", params: { channel_remaining: 0, rainfall_multiplier: 1, channel_cells: [[0, 2]] } };
    expect(isStale(selectScenario(blocked), result)).toBe(false);
  });
  it("is false before any result", () => expect(isStale(selectScenario(heavy), null)).toBe(false));
});

describe("changeSummary", () => {
  const changes = { mean_rainfall_before: 70, mean_rainfall_after: 91, mean_drainage_before: 27.4, mean_drainage_after: 27.4, affected_region_count: 25, affected_regions: [] };
  it("is empty for the baseline", () => expect(changeSummary({ is_baseline: true, changes })).toEqual([]));
  it("reports only what changed, using the response numbers", () => {
    expect(changeSummary({ is_baseline: false, changes })).toEqual(["Mean rainfall 70 mm/h to 91 mm/h", "25 regions modified"]);
  });
  it("lists the modified regions when there are few", () => {
    const c = { ...changes, mean_rainfall_after: 70, mean_drainage_after: 23.2, affected_region_count: 2, affected_regions: ["R4C3", "R5C3"] };
    expect(changeSummary({ is_baseline: false, changes: c })).toEqual(["Mean drain capacity 27.4 mm/h to 23.2 mm/h", "Regions modified: R4C3, R5C3"]);
  });
  it("formats parameter values", () => {
    expect(formatParam(rain, 1.3)).toBe("1.3x");
    expect(formatParam({ unit: "%" }, 20)).toBe("20%");
  });
});
