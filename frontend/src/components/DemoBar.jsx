import { DEMO_STEPS } from "../utils/demo";

/** Fixed presenter bar while demo mode is on. It only triggers the app's normal actions. */
export default function DemoBar({ index, busy, fact, error, onNext, onRestart, onExit }) {
  const step = DEMO_STEPS[index];
  const last = index === DEMO_STEPS.length - 1;
  return (
    <aside aria-label="Demo mode" className="on-dark fixed inset-x-0 bottom-0 z-40 border-t-4 border-[#6aa6d4] bg-ink text-panel shadow-[0_-6px_24px_rgba(16,39,61,0.35)]">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 lg:px-5">
        <div className="min-w-0 flex-1 basis-[28rem]">
          <p className="text-sm text-[#a9bccd]">
            <span className="mr-2 rounded-sm bg-[#6aa6d4] px-1.5 py-0.5 font-semibold text-ink">Demo mode</span>
            Step {index + 1} of {DEMO_STEPS.length}. Real simulation results; nothing is scripted except the clicks.
          </p>
          <p className="font-display text-2xl font-semibold leading-tight" aria-live="polite">{step.title}</p>
          <p className="text-sm text-[#dbe5ee]">{step.say}</p>
          {fact && !busy && <p className="mt-0.5 text-sm font-medium text-white">{fact}</p>}
          {error && <p role="alert" className="mt-0.5 text-sm font-semibold text-[#ffb4aa]">This step did not complete: {error} Fix the problem, then restart the demo.</p>}
        </div>
        <ol className="hidden items-center gap-1 lg:flex" aria-hidden="true">
          {DEMO_STEPS.map((s, i) => (
            <li key={s.id} className={`h-2 w-7 rounded-sm ${i < index ? "bg-[#6aa6d4]" : i === index ? "bg-white" : "bg-white/20"}`} />
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost" onClick={onRestart} disabled={busy}>Restart demo</button>
          <button type="button" className="btn btn-ghost" onClick={onExit}>Exit demo</button>
          <button type="button" className="btn btn-primary min-w-32 !border-[#6aa6d4] !bg-[#6aa6d4] !text-ink" onClick={onNext} disabled={busy || last}>
            {busy ? "Working" : last ? "End of demo" : "Next step"}
          </button>
        </div>
      </div>
    </aside>
  );
}
