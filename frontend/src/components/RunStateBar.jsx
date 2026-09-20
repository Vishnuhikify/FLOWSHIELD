import { changeLines, describePlanItem } from "../utils/interventions";
import { describeRunState } from "../utils/runState";
import { changeSummary } from "../utils/scenarios";

const TONE = {
  baseline: { box: "border-line bg-panel", on: "bg-ink text-panel border-ink" },
  scenario: { box: "border-water bg-[#e3eef8]", on: "bg-water text-white border-water" },
  intervention: { box: "border-safe bg-safe-tint", on: "bg-safe text-white border-safe" },
};
const STAGE_ON = { city: "bg-ink text-panel border-ink", scenario: "bg-water text-white border-water", interventions: "bg-safe text-white border-safe" };
const ghost = "btn btn-ghost";

/** Names the state of everything below it: baseline, scenario, or either with interventions. */
export default function RunStateBar({ data, controlsChanged, scenarioCatalog, interventionCatalog, onBaseline, onWithout, loading }) {
  const state = describeRunState(data);
  const tone = TONE[state.tone];
  const sc = data.scenario;
  const scSpec = scenarioCatalog?.scenarios.find((s) => s.id === sc.id);
  const scParams = (scSpec?.params ?? []).filter((p) => p.kind === "number" && sc.params[p.name] !== undefined);
  const specOf = (id) => interventionCatalog?.interventions.find((i) => i.id === id);

  return (
    <section aria-label="State of these results" className={`rounded-sm border px-4 py-2.5 ${tone.box}`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="min-w-0 flex-1 basis-96">
          <p className="flex flex-wrap items-baseline gap-x-2.5">
            <span className="text-sm text-ink-soft">Results shown for</span>
            <span className="font-display text-2xl font-bold leading-tight">{state.title}</span>
          </p>
          <p className="mt-0.5 text-sm">{state.note}</p>
          {controlsChanged && <p className="mt-1 text-sm font-medium text-warning" role="status">The simulation controls changed since these results. Run again to update them.</p>}
        </div>

        <ol className="flex flex-wrap items-center gap-1 text-sm" aria-label="Inputs applied, in order">
          {state.stages.map((stage, i) => (
            <li key={stage.key} className="flex items-center gap-1">
              {i > 0 && <span className="text-ink-soft" aria-hidden="true">then</span>}
              <span className={`rounded-sm border px-2 py-1 font-medium ${stage.active ? STAGE_ON[stage.key] : "border-line bg-white text-ink-soft"}`}>{stage.label}</span>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-2">
          {data.interventions.count > 0 && <button type="button" className={ghost} onClick={onWithout} disabled={loading}>Run without interventions</button>}
          {state.kind !== "baseline" && <button type="button" className={ghost} onClick={onBaseline} disabled={loading}>Return to baseline</button>}
        </div>
      </div>

      {state.kind !== "baseline" && (
        <div className="mt-3 grid gap-x-8 gap-y-3 border-t border-ink/10 pt-3 text-sm md:grid-cols-2">
          {!sc.is_baseline && (
            <div>
              <p className="font-semibold">Scenario inputs changed</p>
              <p className="text-ink-soft">{scParams.map((p) => `${p.label} ${sc.params[p.name]}${p.unit}`).join(", ")}</p>
              <ul>
                {changeSummary(sc).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
          {data.interventions.count > 0 && (
            <div>
              <p className="font-semibold">Intervention inputs changed ({data.interventions.changed_region_count} region{data.interventions.changed_region_count === 1 ? "" : "s"})</p>
              <ol className="space-y-1">
                {data.interventions.items.map((item, i) => (
                  <li key={i}>
                    <span className="font-medium">{i + 1}. {describePlanItem(item, specOf(item.id))}</span>
                    <ul className="text-ink-soft">
                      {changeLines(item, 5).map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
