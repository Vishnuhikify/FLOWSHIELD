/** Request errors. Says what went wrong and where, then offers the fix. */
export default function StatusBanner({ error, onRetry }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex flex-wrap items-start gap-4 rounded-sm border-l-4 border-critical bg-critical-tint px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-critical">
          {error.kind === "network" ? "Simulation server unreachable" : "Simulation not run"}
        </p>
        <p className="mt-0.5">{error.message}</p>
        {error.details?.length > 0 && (
          <ul className="mt-1.5 space-y-0.5 text-sm">
            {error.details.map((d, i) => (
              <li key={i}>
                <code className="rounded-sm bg-white/70 px-1">{d.field}</code> {d.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <button type="button" onClick={onRetry} className="btn btn-danger !border-critical">
        Run again
      </button>
    </div>
  );
}
