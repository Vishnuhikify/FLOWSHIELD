import { describe, expect, it } from "vitest";
import { interpolate, needsLightText, waterColor } from "../colors";
import { formatDepthCm, formatMinutes, percent } from "../format";
import { BASE_PATTERN_PROBE, buildRequest, controlsKey, DEFAULT_FORM, needsBasePattern, validateForm } from "../simulationRequest";

describe("buildRequest", () => {
  const base = [[90, 80], [60, 50]];

  it("sends no rainfall override for the default storm pattern", () => {
    const body = buildRequest(DEFAULT_FORM, base);
    expect(body).toEqual({ config: { duration_minutes: 60, timestep_minutes: 1, warning_threshold: 0.15, critical_threshold: 0.3 } });
  });

  it("scales the city pattern by intensity", () => {
    expect(buildRequest({ ...DEFAULT_FORM, intensity: 150 }, base).rainfall).toEqual([[135, 120], [90, 75]]);
  });

  it("flags when the storm pattern must be fetched first, so intensity is never dropped silently", () => {
    expect(needsBasePattern({ ...DEFAULT_FORM, intensity: 150 }, null)).toBe(true);
    expect(needsBasePattern({ ...DEFAULT_FORM, intensity: 150 }, base)).toBe(false);
    expect(needsBasePattern(DEFAULT_FORM, null)).toBe(false);                       // 100% needs no pattern
    expect(needsBasePattern({ ...DEFAULT_FORM, rainMode: "uniform", intensity: 150 }, null)).toBe(false);
    expect(BASE_PATTERN_PROBE).toEqual({ config: { duration_minutes: 1, timestep_minutes: 1 } });
  });

  it("controlsKey changes with rainfall, time or thresholds but not with scenario or plan", () => {
    const a = buildRequest(DEFAULT_FORM, base);
    expect(controlsKey(buildRequest(DEFAULT_FORM, base, { id: "heavy_rainfall", params: {} }, [{ id: "increase_drainage", params: {} }]))).toBe(controlsKey(a));
    expect(controlsKey(buildRequest({ ...DEFAULT_FORM, duration: 90 }, base))).not.toBe(controlsKey(a));
    expect(controlsKey(buildRequest({ ...DEFAULT_FORM, intensity: 150 }, base))).not.toBe(controlsKey(a));
    expect(controlsKey(buildRequest({ ...DEFAULT_FORM, critical: 0.4 }, base))).not.toBe(controlsKey(a));
  });

  it("sends a single number for uniform rain", () => {
    expect(buildRequest({ ...DEFAULT_FORM, rainMode: "uniform", uniformRate: 45 }, base).rainfall).toBe(45);
  });
});

describe("validateForm", () => {
  it("accepts the defaults", () => expect(validateForm(DEFAULT_FORM)).toEqual([]));
  it("rejects a duration that is not a multiple of the timestep", () =>
    expect(validateForm({ ...DEFAULT_FORM, duration: 15, timestep: 2 })).toHaveLength(1));
  it("rejects critical <= warning", () =>
    expect(validateForm({ ...DEFAULT_FORM, warning: 0.3, critical: 0.3 })).toHaveLength(1));
  it("rejects an empty threshold", () => expect(validateForm({ ...DEFAULT_FORM, warning: "" }).length).toBeGreaterThan(0));
});

describe("colours and formatting", () => {
  it("clamps the ramp at both ends", () => {
    expect(interpolate(["#000000", "#ffffff"], -1)).toBe("rgb(0, 0, 0)");
    expect(interpolate(["#000000", "#ffffff"], 9)).toBe("rgb(255, 255, 255)");
    expect(interpolate(["#000000", "#ffffff"], NaN)).toBe("rgb(0, 0, 0)");
  });
  it("uses light text only on deep water", () => {
    expect(needsLightText(0.05, 0.3)).toBe(false);
    expect(needsLightText(0.4, 0.3)).toBe(true);
    expect(waterColor(0, 0.3)).toBe("rgb(244, 247, 249)");
  });
  it("formats values", () => {
    expect(formatDepthCm(0.384)).toBe("38");
    expect(formatDepthCm(0.004)).toBe("<1");
    expect(formatDepthCm(0)).toBe("0");
    expect(formatMinutes(33)).toBe("33 min");
    expect(formatMinutes(null)).toBe("-");
    expect(percent(10700, 33200)).toBe(32);
    expect(percent(1, 0)).toBe(0);
  });
});
