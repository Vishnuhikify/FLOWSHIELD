import { useEffect, useMemo, useState } from "react";
import Panel from "./Panel";
import ParamField from "./ParamField";
import TargetPicker from "./TargetPicker";
import { movePlanItem, planStatus, splitPreview, stepStatus, suggestTargets, toggleTarget } from "../utils/interventionLab";
import { addTarget, buildInterventionsPayload, changeLines, describePlanItem, newDraft, TARGET_HINT, validateDraft } from "../utils/interventions";
import { numberParams } from "../utils/scenarios";
import { usePreview } from "../utils/usePreview";

const ghost = "btn btn-ghost";

// The workflow is a real sequence, so the steps are numbered.
function Step({ n, title, done, children }) {
  return (
    <section className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3">
      <span className={`flex h-8 w-8 items-center justify-center rounded-full font-display text-lg font-semibold ${done ? "bg-safe text-white" : "border border-line bg-white text-ink-soft"}`} aria-hidden="true">
        {done ? "✓" : n}
      </span>
      <div className="min-w-0 pb-5">
        <h3 className="font-display text-xl font-semibold leading-8">
          <span className="sr-only">Step {n}: </span>
          {title}
        </h3>
        {children}
      </div>
    </section>
  );
}

function Changes({ item, loading, error }) {
  if (error) return <p className="text-sm text-critical">{error.message}</p>;
  if (!item) return <p className="text-sm text-ink-soft">{loading ? "Checking what this changes" : "Complete the steps above to see what this changes."}</p>;
  return (
    <ul className="text-sm">
      {changeLines(item, 8).map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

export default function InterventionLab({ catalog, catalogError, onRetryCatalog, data, alerts, selectedRegionId, plan, onPlanChange, makeRequest, scenarioName, onRunWith, onRunWithout, onCompare, comparing, loading, stale, blocked }) {
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    if (catalog && !draft) setDraft(newDraft(catalog.interventions[0]));
  }, [catalog, draft]);

  const spec = catalog && draft ? catalog.interventions.find((i) => i.id === draft.id) : null;
  const draftProblems = spec ? validateDraft(spec, draft) : ["loading"];
  const draftValid = draftProblems.length === 0;

  // One preview call covers the plan and, when it is valid, the draft as a trial last item.
  const previewPayload = useMemo(() => {
    if (!spec) return null;
    const items = draftValid ? [...plan, draft] : plan;
    return makeRequest(buildInterventionsPayload(items) ?? []);
  }, [spec, plan, draft, draftValid, makeRequest]);
  const { preview, error: previewError, loading: previewLoading } = usePreview(previewPayload);
  const { planItems, draftItem } = splitPreview(preview, plan.length, draftValid);

  if (catalogError)
    return (
      <Panel id="intervention" title="Intervention lab">
        <p role="alert" className="text-critical">Interventions could not be loaded. {catalogError.message}</p>
        <button type="button" onClick={onRetryCatalog} className={`mt-3 ${ghost}`}>Load interventions again</button>
      </Panel>
    );
  if (!spec) return <Panel id="intervention" title="Intervention lab" aside="Loading interventions"><div className="h-24 rounded-sm bg-line/40" aria-hidden="true" /></Panel>;

  const specOf = (id) => catalog.interventions.find((i) => i.id === id);
  const steps = stepStatus(spec, draft, plan, data?.interventions);
  const status = planStatus(plan, data?.interventions, stale);
  const planFull = plan.length >= catalog.max_interventions;
  const atTargetLimit = spec.max_targets != null && draft.targets.length >= spec.max_targets;
  const suggestions = suggestTargets(alerts, spec).filter((id) => !draft.targets.includes(id));
  const regionIds = preview?.region_ids ?? data?.city.region_ids ?? [];
  const drainage = preview?.drainage_before ?? data?.city.drainage_capacity ?? [];

  return (
    <Panel id="intervention" title="Intervention lab" aside="Interventions change drain inputs, then run the same simulation engine">
      <div className="grid gap-x-10 xl:grid-cols-2">
        <div>
          <Step n={1} title="Choose an intervention" done={steps.choose}>
            <div role="radiogroup" aria-label="Intervention" className="mt-1 grid grid-cols-2 gap-2">
              {catalog.interventions.map((i) => {
                const selected = i.id === draft.id;
                return (
                  <button key={i.id} type="button" role="radio" aria-checked={selected} onClick={() => setDraft({ ...newDraft(i), targets: i.max_targets ? draft.targets.slice(0, i.max_targets) : draft.targets })}
                    className={`rounded-sm border px-3 py-2 text-left ${selected ? "border-ink bg-ink text-panel" : "border-line bg-white hover:border-ink"}`}>
                    <span className="block font-display text-lg font-semibold leading-tight">{i.name}</span>
                    <span className={`mt-0.5 block text-sm ${selected ? "text-[#c9d6e2]" : "text-ink-soft"}`}>{i.summary}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-3">{spec.description}</p>
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer font-semibold">Modeling assumptions</summary>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-soft">
                {spec.assumptions.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </details>
          </Step>

          <Step n={2} title="Choose target regions" done={steps.targets}>
            <p className="text-sm text-ink-soft">{TARGET_HINT[spec.target_mode]}{spec.max_targets ? ` Up to ${spec.max_targets} regions.` : ""}</p>
            {regionIds.length > 0 && (
              <div className="mt-2">
                <TargetPicker regionIds={regionIds} drainage={drainage} peakRisk={data?.grids.peak_risk} targets={draft.targets}
                  onToggle={(id) => (draft.targets.includes(id) || !atTargetLimit) && setDraft(toggleTarget(draft, id))} />
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" className={ghost} disabled={!selectedRegionId || draft.targets.includes(selectedRegionId) || atTargetLimit} onClick={() => setDraft(addTarget(draft, selectedRegionId))}>
                {selectedRegionId ? `Add ${selectedRegionId} from the flood map` : "Add the region selected on the flood map"}
              </button>
              <button type="button" className={ghost} disabled={suggestions.length === 0 || atTargetLimit} onClick={() => setDraft(suggestions.reduce((d, id) => (spec.max_targets != null && d.targets.length >= spec.max_targets ? d : addTarget(d, id)), draft))}>
                Add the most urgent regions
              </button>
              <button type="button" className={ghost} disabled={draft.targets.length === 0} onClick={() => setDraft({ ...draft, targets: [] })}>Clear targets</button>
            </div>
            <p className="mt-2 text-sm">
              <span className="font-semibold">Targets: </span>
              {draft.targets.length > 0 ? draft.targets.join(", ") : spec.target_mode === "required" ? "none yet" : spec.target_mode === "optional_all" ? "every region" : "the channel"}
            </p>
          </Step>

          <Step n={3} title="Set the parameters" done={steps.params}>
            <div className="mt-1 space-y-4">
              {numberParams(spec).map((p) => (
                <ParamField key={p.name} spec={p} value={draft.params[p.name]} onChange={(v) => setDraft({ ...draft, params: { ...draft.params, [p.name]: v } })} />
              ))}
            </div>
          </Step>
        </div>

        <div>
          <Step n={4} title="Check the change and add it to the plan" done={steps.plan}>
            <div className="mt-1 rounded-sm border border-line bg-white px-3 py-2">
              <p className="text-sm font-semibold">This intervention would change</p>
              {draftValid ? <Changes item={draftItem} loading={previewLoading} error={previewError} /> : <p className="text-sm text-ink-soft">{draftProblems.join(" ")}</p>}
              <p className="mt-1 text-sm text-ink-soft">Calculated by the backend for the {scenarioName} scenario, after the {plan.length} intervention{plan.length === 1 ? "" : "s"} already in the plan.</p>
            </div>
            <button type="button" className="btn btn-ghost mt-2 !border-ink" disabled={!draftValid || planFull} onClick={() => { onPlanChange([...plan, draft]); setDraft(newDraft(spec)); }}>
              Add to plan
            </button>
            {planFull && <p className="mt-1 text-sm text-ink-soft">The plan holds at most {catalog.max_interventions} interventions.</p>}

            <h4 className="h-sub mt-4">Intervention plan ({plan.length})</h4>
            {plan.length === 0 ? (
              <p className="text-sm text-ink-soft">The plan is empty. Interventions are applied in the order listed.</p>
            ) : (
              <ol className="mt-1 space-y-2">
                {plan.map((item, i) => (
                  <li key={i} className="rounded-sm border border-line bg-white px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-medium"><span className="mr-2 font-display font-semibold">{i + 1}</span>{describePlanItem(item, specOf(item.id))}</p>
                      <span className="flex shrink-0 gap-1">
                        <button type="button" className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => onPlanChange(movePlanItem(plan, i, -1))} aria-label={`Move intervention ${i + 1} up`}>↑</button>
                        <button type="button" className="btn btn-ghost btn-sm" disabled={i === plan.length - 1} onClick={() => onPlanChange(movePlanItem(plan, i, 1))} aria-label={`Move intervention ${i + 1} down`}>↓</button>
                        <button type="button" className="btn btn-danger btn-sm !font-medium" onClick={() => onPlanChange(plan.filter((_, k) => k !== i))} aria-label={`Remove intervention ${i + 1}`}>Remove</button>
                      </span>
                    </div>
                    <div className="mt-1 text-ink-soft"><Changes item={planItems[i]} loading={previewLoading} error={previewError} /></div>
                  </li>
                ))}
              </ol>
            )}
            {plan.length > 0 && <button type="button" className={`mt-2 ${ghost}`} onClick={() => onPlanChange([])}>Clear plan</button>}
          </Step>

          <Step n={5} title="Run and compare" done={steps.run}>
            <p className="text-sm text-ink-soft">Both buttons use the same scenario (<span className="font-semibold text-ink">{scenarioName}</span>) and the same simulation controls, so the only difference is the plan. Compare both runs puts them side by side under Modeled impact.</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button type="button" onClick={onRunWith} disabled={loading || plan.length === 0 || blocked}
                className="btn btn-positive btn-lg">
                {loading && <span className="fs-spinner inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
                Run with interventions
              </button>
              <button type="button" onClick={onRunWithout} disabled={loading || blocked} className={`${ghost} py-2.5`}>Run without interventions</button>
              <button type="button" onClick={onCompare} disabled={comparing || plan.length === 0 || blocked} className="btn btn-ink py-2.5">
                {comparing ? "Comparing" : "Compare both runs"}
              </button>
            </div>
            <p className={`mt-2 text-sm font-medium ${status === "applied" ? "text-safe" : status === "empty" ? "text-ink-soft" : "text-warning"}`} role="status">
              {status === "empty" && "Add an intervention to the plan to run it."}
              {status === "not_applied" && "The results on screen are without interventions. Run with interventions to apply this plan."}
              {status === "changed" && "The plan changed since the results on screen. Run with interventions to update them."}
              {status === "applied" && "The results on screen include this plan."}
            </p>
          </Step>
        </div>
      </div>
    </Panel>
  );
}
