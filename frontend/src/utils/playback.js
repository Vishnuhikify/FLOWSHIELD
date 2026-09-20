// Playback state machine for the timeline. Pure, so every transition is unit-tested.
export const SPEEDS = [0.5, 1, 2, 4, 8];
export const FRAME_MS = 360; // one timestep per 360 ms at 1x

export const clampStep = (step, last) => Math.min(last, Math.max(0, Math.round(Number(step) || 0)));

export const initialPlayback = (last = 0) => ({ step: last, last, playing: false, speed: 1 });

export function playbackReducer(state, action) {
  switch (action.type) {
    case "load": {
      // A new simulation arrived. Autoplay from t = 0 so the 0 -> final progression is seen;
      // without autoplay (reduced motion) show the final state.
      const last = Math.max(0, action.frames - 1);
      const autoplay = action.autoplay && last > 0;
      return { ...state, last, step: autoplay ? 0 : last, playing: autoplay };
    }
    case "tick": {
      if (!state.playing) return state;
      const step = Math.min(state.last, state.step + 1);
      return { ...state, step, playing: step < state.last };
    }
    case "toggle":
      if (state.playing) return { ...state, playing: false };
      if (state.last === 0) return state;
      return { ...state, playing: true, step: state.step >= state.last ? 0 : state.step };
    case "restart":
      return { ...state, step: 0, playing: state.last > 0 };
    case "seek": // scrubbing always pauses, so the chosen timestep stays on screen
      return { ...state, step: clampStep(action.step, state.last), playing: false };
    case "speed":
      return SPEEDS.includes(action.speed) ? { ...state, speed: action.speed } : state;
    default:
      return state;
  }
}
