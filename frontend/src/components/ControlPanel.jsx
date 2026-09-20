import Panel from "./Panel";
import { TIMESTEPS } from "../utils/simulationRequest";

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{label}</span>
        {hint && <span className="text-sm text-ink-soft">{hint}</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

const inputClass = "w-full rounded-sm border border-line bg-white px-2.5 py-1.5 text-ink";

function Segmented({ value, onChange, options, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 rounded-sm border border-line bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-sm px-2 py-1.5 text-sm font-medium ${value === o.value ? "bg-ink text-panel" : "text-ink-soft hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function ControlPanel({ form, onChange, onRun, loading, problems, steps, scenarioName, planCount = 0 }) {
  const set = (key) => (e) => onChange({ ...form, [key]: e.target.value === "" ? "" : Number(e.target.value) });

  return (
    <Panel title="Simulation controls">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          onRun();
        }}
      >
        <fieldset className="space-y-3">
          <legend className="h-sub">Rainfall</legend>
          <Segmented
            label="Rainfall mode"
            value={form.rainMode}
            onChange={(rainMode) => onChange({ ...form, rainMode })}
            options={[
              { value: "pattern", label: "Storm pattern" },
              { value: "uniform", label: "Uniform" },
            ]}
          />
          {form.rainMode === "pattern" ? (
            <Field label="Storm intensity" hint={`${form.intensity}%`}>
              <input type="range" min="0" max="250" step="10" value={form.intensity} onChange={set("intensity")} />
              <p className="mt-1 text-sm text-ink-soft">Scales the city's storm: heaviest over the northern hills, lighter in the south.</p>
            </Field>
          ) : (
            <Field label="Rain rate" hint={`${form.uniformRate} mm/h`}>
              <input type="range" min="0" max="200" step="5" value={form.uniformRate} onChange={set("uniformRate")} />
              <p className="mt-1 text-sm text-ink-soft">The same rain rate over every region.</p>
            </Field>
          )}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="h-sub">Time</legend>
          <Field label="Duration" hint={`${form.duration || 0} min`}>
            <input type="range" min="10" max="240" step="10" value={form.duration} onChange={set("duration")} />
          </Field>
          <Field label="Timestep" hint={steps ? `${steps} steps` : undefined}>
            <select className={inputClass} value={form.timestep} onChange={set("timestep")}>
              {TIMESTEPS.map((t) => (
                <option key={t} value={t}>
                  {t === 0.5 ? "30 seconds" : `${t} minute${t > 1 ? "s" : ""}`}
                </option>
              ))}
            </select>
          </Field>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="h-sub">Risk thresholds</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Warning at" hint="m">
              <input className={inputClass} type="number" min="0.01" step="0.01" value={form.warning} onChange={set("warning")} />
            </Field>
            <Field label="Critical at" hint="m">
              <input className={inputClass} type="number" min="0.02" step="0.01" value={form.critical} onChange={set("critical")} />
            </Field>
          </div>
          <p className="text-sm text-ink-soft">Standing water depth. Prototype assumptions, not official flood levels.</p>
        </fieldset>

        {problems.length > 0 && (
          <ul className="space-y-1 text-sm text-critical" role="alert">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}

        <p className="text-sm text-ink-soft">
          Runs with scenario: <span className="font-semibold text-ink">{scenarioName}</span>
          {planCount > 0 && <>, plus <span className="font-semibold text-ink">{planCount} intervention{planCount === 1 ? "" : "s"}</span></>}
        </p>

        <button
          type="submit"
          disabled={loading || problems.length > 0}
          className="btn btn-primary btn-lg w-full"
        >
          {loading && <span className="fs-spinner inline-block h-4 w-4 rounded-full border-2 border-white/40 border-t-white" aria-hidden="true" />}
          {loading ? "Running simulation" : "Run simulation"}
        </button>
      </form>
    </Panel>
  );
}
