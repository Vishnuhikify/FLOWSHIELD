import { describe, expect, it } from "vitest";
import { clampStep, initialPlayback, playbackReducer as reduce, SPEEDS } from "../playback";

const loaded = (frames = 61, autoplay = true) => reduce(initialPlayback(), { type: "load", frames, autoplay });
const run = (state, ...types) => types.reduce((s, type) => reduce(s, { type }), state);

describe("playback reducer", () => {
  it("autoplays a new result from step 0", () => {
    expect(loaded()).toMatchObject({ step: 0, last: 60, playing: true });
  });

  it("shows the final state without autoplay (reduced motion)", () => {
    expect(loaded(61, false)).toMatchObject({ step: 60, last: 60, playing: false });
  });

  it("advances exactly one timestep per tick and stops on the last one", () => {
    let s = loaded(4); // steps 0..3
    s = run(s, "tick");
    expect(s).toMatchObject({ step: 1, playing: true });
    s = run(s, "tick", "tick");
    expect(s).toMatchObject({ step: 3, playing: false });
    expect(run(s, "tick").step).toBe(3); // ticks after the end are ignored
  });

  it("visits every timestep in order", () => {
    let s = loaded(121);
    const seen = [s.step];
    while (s.playing) {
      s = run(s, "tick");
      seen.push(s.step);
    }
    expect(seen).toEqual(Array.from({ length: 121 }, (_, i) => i));
  });

  it("pauses and resumes from the same timestep", () => {
    let s = run(loaded(), "tick", "tick", "toggle");
    expect(s).toMatchObject({ step: 2, playing: false });
    expect(run(s, "tick").step).toBe(2);
    expect(run(s, "toggle", "tick")).toMatchObject({ step: 3, playing: true });
  });

  it("play at the end replays from the start", () => {
    const end = reduce(loaded(), { type: "seek", step: 60 });
    expect(run(end, "toggle")).toMatchObject({ step: 0, playing: true });
  });

  it("restart goes to step 0 and plays", () => {
    const mid = reduce(loaded(), { type: "seek", step: 33 });
    expect(run(mid, "restart")).toMatchObject({ step: 0, playing: true });
  });

  it("seek selects the exact timestep, clamps, and pauses", () => {
    const s = loaded();
    expect(reduce(s, { type: "seek", step: 33 })).toMatchObject({ step: 33, playing: false });
    expect(reduce(s, { type: "seek", step: -5 }).step).toBe(0);
    expect(reduce(s, { type: "seek", step: 999 }).step).toBe(60);
    expect(reduce(s, { type: "seek", step: 12.6 }).step).toBe(13);
    expect(reduce(s, { type: "seek", step: "abc" }).step).toBe(0);
  });

  it("changes speed without moving the timeline and rejects unknown speeds", () => {
    const s = reduce(loaded(), { type: "seek", step: 10 });
    expect(reduce(s, { type: "speed", speed: 4 })).toMatchObject({ speed: 4, step: 10 });
    expect(reduce(s, { type: "speed", speed: 3 }).speed).toBe(1);
    expect(SPEEDS).toContain(0.5);
  });

  it("a shorter new result can never leave a stale step", () => {
    const long = reduce(loaded(241), { type: "seek", step: 200 });
    expect(reduce(long, { type: "load", frames: 11, autoplay: false })).toMatchObject({ step: 10, last: 10 });
  });

  it("handles a single-frame timeline", () => {
    const s = loaded(1);
    expect(s).toMatchObject({ step: 0, last: 0, playing: false });
    expect(run(s, "toggle", "restart", "tick")).toMatchObject({ step: 0, playing: false });
  });

  it("clampStep", () => {
    expect(clampStep(5, 3)).toBe(3);
    expect(clampStep(NaN, 3)).toBe(0);
  });
});
