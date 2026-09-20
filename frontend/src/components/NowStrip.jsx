import { formatDepth, formatMinutes, formatPeople } from "../utils/format";

function Count({ n, label, className }) {
  return (
    <div className={`rounded-sm px-3 py-1.5 ${className}`}>
      <span className="font-display text-3xl font-bold leading-none">{n}</span>
      <span className="ml-1.5 text-sm font-medium">{label}</span>
    </div>
  );
}

/** The CURRENT state at the selected timestep. Dark, to set it apart from the forecast cards. */
export default function NowStrip({ frame, deepestRegion, playing }) {
  const calm = frame.critical + frame.warning === 0;
  return (
    <section aria-label="Current state" className="on-dark rounded-sm bg-ink px-4 py-3 text-panel xl:self-start">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 xl:flex-col xl:items-stretch xl:gap-y-4">
        <div className="min-w-32">
          <p className="text-sm text-[#a9bccd]">
            {frame.isStart ? "Start of simulation" : frame.isFinal ? "End of simulation" : playing ? "Simulation time, playing" : "Simulation time"}
          </p>
          <p className="font-display text-5xl font-bold leading-none" aria-live="off">
            {formatMinutes(frame.time)}
          </p>
          <p className="mt-0.5 text-sm text-[#a9bccd]">
            Step {frame.step} of {frame.lastStep}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 xl:flex-col">
          <Count n={frame.critical} label="critical" className={frame.critical > 0 ? "bg-critical text-white" : "bg-white/10 text-[#a9bccd]"} />
          <Count n={frame.warning} label="warning" className={frame.warning > 0 ? "bg-warning-fill text-[#3d2500]" : "bg-white/10 text-[#a9bccd]"} />
          <Count n={frame.safe} label="safe" className="bg-white/10" />
        </div>

        <dl className="grid grid-cols-3 gap-x-6 gap-y-3 text-sm xl:grid-cols-1">
          <div>
            <dt className="text-[#a9bccd]">People in critical</dt>
            <dd className="font-display text-2xl font-semibold">{formatPeople(frame.criticalPopulation)}</dd>
          </div>
          <div>
            <dt className="text-[#a9bccd]">People in warning</dt>
            <dd className="font-display text-2xl font-semibold">{formatPeople(frame.warningPopulation)}</dd>
          </div>
          <div>
            <dt className="text-[#a9bccd]">Deepest water</dt>
            <dd className="font-display text-2xl font-semibold">
              {formatDepth(frame.maxWater)}
              {deepestRegion && <span className="ml-1 text-sm font-normal text-[#a9bccd]">{deepestRegion}</span>}
            </dd>
          </div>
        </dl>
      </div>
      {calm && <p className="mt-2 text-sm text-[#a9bccd]">Every region is below the warning depth at this moment.</p>}
    </section>
  );
}
