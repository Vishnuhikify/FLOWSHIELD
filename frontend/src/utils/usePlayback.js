import { useEffect, useMemo, useReducer } from "react";
import { FRAME_MS, initialPlayback, playbackReducer } from "./playback";

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Timeline playback over `frames` timesteps. `resetKey` changes when a new result arrives. */
export function usePlayback(frames, resetKey) {
  const [state, dispatch] = useReducer(playbackReducer, undefined, () => initialPlayback(0));

  useEffect(() => {
    dispatch({ type: "load", frames, autoplay: Boolean(resetKey) && !prefersReducedMotion() });
  }, [resetKey, frames]);

  useEffect(() => {
    if (!state.playing) return undefined;
    const timer = setInterval(() => dispatch({ type: "tick" }), FRAME_MS / state.speed);
    return () => clearInterval(timer);
  }, [state.playing, state.speed]);

  const actions = useMemo(
    () => ({
      toggle: () => dispatch({ type: "toggle" }),
      restart: () => dispatch({ type: "restart" }),
      seek: (step) => dispatch({ type: "seek", step }),
      setSpeed: (speed) => dispatch({ type: "speed", speed }),
    }),
    []
  );

  // A stale step can never index past the new timeline.
  return { ...state, step: Math.min(state.step, Math.max(0, frames - 1)), ...actions };
}
