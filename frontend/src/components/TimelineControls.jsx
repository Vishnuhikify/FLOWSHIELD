import { useMemo } from "react";
import { formatMinutes } from "../utils/format";
import { SPEEDS } from "../utils/playback";
import { bandGradient, milestones, riskBandSegments } from "../utils/progression";
import { RISK } from "../utils/risk";

const btn = "btn btn-ghost";
const BAND = { SAFE: "#b9d6cc", WARNING: RISK.WARNING.fill, CRITICAL: RISK.CRITICAL.hex };

export default function TimelineControls({ playback, timeline }) {
  const { step, last, playing, speed, setSpeed, toggle, restart, seek } = playback;
  const { timestamps } = timeline;
  const band = useMemo(() => bandGradient(riskBandSegments(timeline), BAND), [timeline]);
  const marks = useMemo(() => milestones(timeline), [timeline]);
  const dt = last > 0 ? timestamps[1] - timestamps[0] : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-ink min-w-20" onClick={toggle} disabled={last === 0}>
          {playing ? "Pause" : "Play"}
        </button>
        <button type="button" className={btn} onClick={restart} disabled={last === 0}>
          Restart
        </button>
        <button type="button" className={btn} onClick={() => seek(step - 1)} disabled={step === 0} aria-label="Previous timestep">
          ‹
        </button>
        <button type="button" className={btn} onClick={() => seek(step + 1)} disabled={step === last} aria-label="Next timestep">
          ›
        </button>

        <span className="ml-auto text-sm text-ink-soft">Speed</span>
        <div role="radiogroup" aria-label="Playback speed" className="seg">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={speed === s}
              onClick={() => setSpeed(s)}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      <div>
        <input
          type="range"
          min="0"
          max={last}
          step="1"
          value={step}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Simulation time"
          aria-valuetext={`${formatMinutes(timestamps[step])}, step ${step} of ${last}`}
        />
        {/* Worst risk level in the city at each timestep - the whole run at a glance. */}
        <div className="mx-2 h-2.5 rounded-sm" style={{ background: band }} aria-hidden="true" />
        <div className="mt-1 flex justify-between text-sm text-ink-soft">
          <span>0 min</span>
          <span>
            One step = {formatMinutes(dt)}
          </span>
          <span>{formatMinutes(timestamps[last])}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-soft">Jump to</span>
        <button type="button" className={btn} disabled={marks.firstWarningStep == null} onClick={() => seek(marks.firstWarningStep)}>
          First warning{marks.firstWarningStep != null && `, ${formatMinutes(timestamps[marks.firstWarningStep])}`}
        </button>
        <button type="button" className={btn} disabled={marks.firstCriticalStep == null} onClick={() => seek(marks.firstCriticalStep)}>
          First critical{marks.firstCriticalStep != null && `, ${formatMinutes(timestamps[marks.firstCriticalStep])}`}
        </button>
        <button type="button" className={btn} disabled={step === last} onClick={() => seek(last)}>
          End of run
        </button>
      </div>
    </div>
  );
}
