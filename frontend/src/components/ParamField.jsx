import { formatParam } from "../utils/scenarios";

/** Slider for one numeric parameter described by the backend catalogue. */
export default function ParamField({ spec, value, onChange }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{spec.label}</span>
        <span className="font-display text-lg font-semibold">{formatParam(spec, value)}</span>
      </span>
      <input type="range" min={spec.minimum} max={spec.maximum} step={spec.step ?? "any"} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1" />
      <span className="flex justify-between text-sm text-ink-soft">
        <span>{formatParam(spec, spec.minimum)}</span>
        <span>Default {formatParam(spec, spec.default)}</span>
        <span>{formatParam(spec, spec.maximum)}</span>
      </span>
      <span className="mt-1 block text-sm text-ink-soft">{spec.description}</span>
    </label>
  );
}
