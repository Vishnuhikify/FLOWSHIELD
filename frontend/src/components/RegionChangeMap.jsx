import { DIRECTION, statusGrid } from "../utils/comparison";

const MAX_CELLS = 400;
const GLYPH = { improved: "\u2193", worsened: "\u2191", unchanged: "" }; // arrow = direction of flooding, so meaning is not colour-only

export default function RegionChangeMap({ comparison, selectedId, onSelect }) {
  const { rows, cols } = comparison.meta;
  if (rows * cols > MAX_CELLS) return null;
  const compact = cols > 8;
  return (
    <div>
      <div className="grid w-full max-w-[300px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: compact ? 1 : 3 }}>
        {statusGrid(comparison).flat().map((r) => (
          <button key={r.id} type="button" onClick={() => onSelect(r.id)} aria-pressed={r.id === selectedId}
            aria-label={`${r.id}: ${DIRECTION[r.status].label.toLowerCase()}${r.reason ? `, ${r.reason}` : ""}`}
            className={`aspect-square rounded-sm text-center leading-none ${r.id === selectedId ? "outline outline-2 outline-ink" : ""}`}
            style={{ background: r.status === "unchanged" ? "#eef2f5" : DIRECTION[r.status].hex, color: r.status === "unchanged" ? "#4a6076" : "#fff" }}>
            {!compact && (
              <>
                <span className="block text-[10px] opacity-80">{r.id}</span>
                <span className="block font-display text-lg font-semibold">{GLYPH[r.status]}</span>
              </>
            )}
          </button>
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <li><span className="mr-1 inline-block h-3 w-3 rounded-sm bg-safe align-middle" />{"\u2193"} Less flooding</li>
        <li><span className="mr-1 inline-block h-3 w-3 rounded-sm bg-critical align-middle" />{"\u2191"} More flooding</li>
        <li><span className="mr-1 inline-block h-3 w-3 rounded-sm border border-line bg-[#eef2f5] align-middle" />No change</li>
      </ul>
    </div>
  );
}
