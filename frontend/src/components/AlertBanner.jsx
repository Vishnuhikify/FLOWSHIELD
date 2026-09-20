import { relativeTime } from "../utils/earlyWarning";
import { formatMinutes } from "../utils/format";

const LEVEL = {
  critical: { title: "Critical flooding", box: "bg-critical text-white border-critical", sub: "text-white/85", btn: "border-white/70 hover:bg-white/15" },
  imminent: { title: "Critical flooding imminent", box: "bg-critical-tint text-ink border-critical", sub: "text-ink-soft", btn: "border-critical text-critical hover:bg-white/60" },
  soon: { title: "Critical flooding approaching", box: "bg-warning-tint text-ink border-warning-fill", sub: "text-ink-soft", btn: "border-warning text-warning hover:bg-white/60" },
  warning: { title: "Warning", box: "bg-warning-tint text-ink border-warning-fill", sub: "text-ink-soft", btn: "border-warning text-warning hover:bg-white/60" },
  watch: { title: "Watch", box: "bg-panel text-ink border-line", sub: "text-ink-soft", btn: "border-line hover:border-ink" },
  clear: { title: "All clear", box: "bg-safe-tint text-ink border-safe", sub: "text-ink-soft", btn: "border-line hover:border-ink" },
};

function Milestone({ label, event, onJump, style, none }) {
  return (
    <div className="min-w-40">
      <p className={`text-sm ${style.sub}`}>{label}</p>
      {event ? (
        <>
          <p className="font-display text-3xl font-bold leading-none">{formatMinutes(event.time)}</p>
          <p className="mt-1 flex items-center gap-2 text-sm">
            <span>{relativeTime(event.minutesAway)}</span>
            <button type="button" onClick={() => onJump(event.step)} disabled={event.minutesAway === 0} className={`rounded-sm border px-2 py-0.5 font-medium disabled:opacity-40 ${style.btn}`}>
              Jump there
            </button>
          </p>
        </>
      ) : (
        <p className="font-display text-xl font-semibold">{none}</p>
      )}
    </div>
  );
}

/** City-level early warning. Left: current state at the selected timestep. Right: forecast milestones. */
export default function AlertBanner({ outlook, onJump }) {
  const style = LEVEL[outlook.level];
  return (
    <section id="alert" data-section="" aria-label="Early warning status" className={`rounded-sm border-l-8 px-4 py-3 ${style.box}`}>
      <div className="flex flex-wrap items-start gap-x-10 gap-y-3">
        <div className="min-w-0 flex-1 basis-80">
          <p className={`text-sm ${style.sub}`}>Early warning, at {formatMinutes(outlook.time)}</p>
          <p className="font-display text-3xl font-bold leading-tight">{style.title}</p>
          <p className="mt-1">
            <span className="font-semibold">Now: </span>
            {outlook.current}
          </p>
          <p>
            <span className="font-semibold">Forecast: </span>
            {outlook.forecast}
          </p>
        </div>
        <Milestone label="First warning in this run" event={outlook.firstWarning} onJump={onJump} style={style} none="Not reached" />
        <Milestone label="First critical in this run" event={outlook.firstCritical} onJump={onJump} style={style} none="Not reached" />
      </div>
    </section>
  );
}
