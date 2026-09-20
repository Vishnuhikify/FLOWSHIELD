import { RISK } from "../utils/risk";

const MAX_CELLS = 400;

/** Small clickable map of the city for choosing target regions. Shows each region's current drain capacity. */
export default function TargetPicker({ regionIds, drainage, peakRisk, targets, onToggle, disabled }) {
  const rows = regionIds.length;
  const cols = regionIds[0]?.length ?? 0;
  if (rows * cols > MAX_CELLS) return <p className="text-sm text-ink-soft">This city has {rows * cols} regions. Select a region on the flood map, then add it here.</p>;
  const compact = cols > 8;
  return (
    <div>
      <div className="grid w-full max-w-[340px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: compact ? 1 : 3 }}>
        {regionIds.flatMap((row, r) =>
          row.map((id, c) => {
            const on = targets.includes(id);
            const risk = peakRisk?.[r]?.[c] ?? "SAFE";
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => onToggle(id)}
                aria-pressed={on}
                aria-label={`${id}, drain capacity ${drainage[r][c]} mm/h, ${RISK[risk].label.toLowerCase()} in the results on screen${on ? ", targeted" : ""}`}
                className={`relative aspect-square rounded-sm text-center leading-none disabled:cursor-not-allowed ${on ? "bg-ink text-panel" : "hover:brightness-95"}`}
                style={on ? undefined : { background: risk === "SAFE" ? "#eef2f5" : RISK[risk].fill, color: risk === "CRITICAL" ? "#fff" : "#10273d" }}
              >
                {!compact && (
                  <>
                    <span className="block text-[10px] opacity-75">{id}</span>
                    <span className="block font-display text-base font-semibold">{Number(drainage[r][c].toFixed(1))}</span>
                  </>
                )}
                {on && <span className="absolute right-0.5 top-0 text-xs" aria-hidden="true">✓</span>}
              </button>
            );
          })
        )}
      </div>
      <p className="mt-1.5 text-sm text-ink-soft">
        Numbers are drain capacity in mm/h for the selected scenario. Colour shows the worst level each region reaches in the results on screen.
      </p>
    </div>
  );
}
