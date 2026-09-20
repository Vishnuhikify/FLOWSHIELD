import Panel from "./Panel";
import ParamField from "./ParamField";
import { BASELINE_ID, numberParams } from "../utils/scenarios";

export default function ScenarioLab({ catalog, catalogError, onRetryCatalog, selection, onSelect, onParam, onRun, onBaseline, loading, problems, activeId, stale }) {
  if (catalogError)
    return (
      <Panel id="scenario" title="Scenario lab">
        <p role="alert" className="text-critical">Scenarios could not be loaded. {catalogError.message}</p>
        <p className="mt-1 text-sm text-ink-soft">The baseline simulation still works from the simulation controls.</p>
        <button type="button" onClick={onRetryCatalog} className="btn btn-ghost mt-3">Load scenarios again</button>
      </Panel>
    );
  if (!catalog) return <Panel id="scenario" title="Scenario lab" aside="Loading scenarios"><div className="h-24 rounded-sm bg-line/40" aria-hidden="true" /></Panel>;

  const scenario = catalog.scenarios.find((s) => s.id === selection.id) ?? catalog.scenarios[0];
  const params = numberParams(scenario);
  const isBaseline = scenario.id === BASELINE_ID;

  return (
    <Panel id="scenario" title="Scenario lab" aside="Scenarios change the inputs, then run the same simulation engine">
      <div role="radiogroup" aria-label="Scenario" className="grid grid-cols-2 gap-2 md:grid-cols-3 2xl:grid-cols-6">
        {catalog.scenarios.map((s) => {
          const selected = s.id === selection.id;
          return (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(s)}
              className={`rounded-sm border px-3 py-2 text-left ${selected ? "border-ink bg-ink text-panel" : "border-line bg-white hover:border-ink"}`}
            >
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-display text-lg font-semibold leading-tight">{s.name}</span>
                {s.id === activeId && <span className={`shrink-0 text-xs font-semibold ${selected ? "text-[#a9bccd]" : "text-water"}`}>On screen</span>}
              </span>
              <span className={`mt-0.5 block text-sm ${selected ? "text-[#c9d6e2]" : "text-ink-soft"}`}>{s.summary}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 grid gap-x-8 gap-y-4 border-t border-line pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <h3 className="h-sub">{scenario.name}</h3>
          <p className="mt-1">{scenario.description}</p>
          <p className="mt-3 text-sm font-semibold">Assumptions</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-soft">
            {scenario.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
            {!isBaseline && <li>Applied on top of the rainfall, time and thresholds set in the simulation controls.</li>}
          </ul>
        </div>

        <div className="space-y-4">
          {params.length === 0 ? (
            <p className="text-sm text-ink-soft">The baseline has no parameters. It runs the city exactly as set in the simulation controls.</p>
          ) : (
            params.map((spec) => <ParamField key={spec.name} spec={spec} value={selection.params[spec.name]} onChange={(v) => onParam(spec.name, v)} />)
          )}

          {problems.length > 0 && (
            <ul className="space-y-1 text-sm text-critical" role="alert">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onRun}
              disabled={loading || problems.length > 0}
              className="btn btn-primary btn-lg"
            >
              {loading && <span className="fs-spinner inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
              {loading ? "Running scenario" : "Run scenario"}
            </button>
            <button type="button" onClick={onBaseline} disabled={loading || (activeId === BASELINE_ID && isBaseline)} className="btn btn-ghost px-4 py-2.5">
              Return to baseline
            </button>
            {stale && <p className="basis-full text-sm font-medium text-warning">The results below are from a different scenario or setting. Run the scenario to update them.</p>}
          </div>
        </div>
      </div>
    </Panel>
  );
}
