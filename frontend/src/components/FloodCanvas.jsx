import { useEffect, useRef, useState } from "react";
import { cellColors } from "../utils/colors";
import { formatDepthCm } from "../utils/format";
import { RISK } from "../utils/risk";

const SIZE = 620; // CSS pixels on the long side

/** Large grids: one canvas repaint per timestep instead of thousands of DOM nodes. */
export default function FloodCanvas({ data, water, risks, view, ctx, selectedId, onSelect, markedIds }) {
  const { rows, cols } = data.meta;
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const cell = SIZE / Math.max(rows, cols);
  const width = cell * cols;
  const height = cell * rows;

  useEffect(() => {
    const canvas = ref.current;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const g = canvas.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const gap = cell >= 8 ? 1 : 0;
    const elevation = data.city.elevation;

    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        g.fillStyle = cellColors(view, water[r][c], risks[r][c], elevation[r][c], ctx).background;
        g.fillRect(c * cell, r * cell, cell - gap, cell - gap);
      }
    }
    // Second pass so risk frames sit on top of neighbouring fills.
    if (view !== "risk") {
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const risk = risks[r][c];
          if (risk === "SAFE") continue;
          const w = Math.max(1, Math.min(risk === "CRITICAL" ? 3 : 2, cell / 4));
          g.strokeStyle = RISK[risk].hex;
          g.lineWidth = w;
          g.strokeRect(c * cell + w / 2, r * cell + w / 2, cell - gap - w, cell - gap - w);
        }
      }
    }
    if (markedIds?.size > 0) {
      g.fillStyle = "#2a6f5f";
      const m = Math.max(2, cell / 3);
      data.regions.forEach((r) => {
        if (!markedIds.has(r.id)) return;
        g.beginPath();
        g.moveTo((r.col + 1) * cell - gap - m, r.row * cell);
        g.lineTo((r.col + 1) * cell - gap, r.row * cell);
        g.lineTo((r.col + 1) * cell - gap, r.row * cell + m);
        g.fill();
      });
    }
    const sel = selectedId && data.regions.find((x) => x.id === selectedId);
    if (sel) {
      g.strokeStyle = "#10273d";
      g.lineWidth = 3;
      g.strokeRect(sel.col * cell - 1.5, sel.row * cell - 1.5, cell + 2, cell + 2);
    }
  }, [data, water, risks, view, ctx, selectedId, markedIds, rows, cols, cell, width, height]);

  const cellFromEvent = (e) => {
    const box = ref.current.getBoundingClientRect();
    const c = Math.floor(((e.clientX - box.left) / box.width) * cols);
    const r = Math.floor(((e.clientY - box.top) / box.height) * rows);
    return r >= 0 && r < rows && c >= 0 && c < cols ? { r, c } : null;
  };

  return (
    <div className="relative mx-auto w-full" style={{ maxWidth: width }}>
      <canvas
        ref={ref}
        role="img"
        aria-label={`Flood map of ${rows} by ${cols} regions. Use the regions at risk list to select a region.`}
        className="block h-auto w-full cursor-crosshair rounded-sm"
        style={{ aspectRatio: `${cols} / ${rows}` }}
        onMouseMove={(e) => setHover(cellFromEvent(e))}
        onMouseLeave={() => setHover(null)}
        onClick={(e) => {
          const hit = cellFromEvent(e);
          if (hit) onSelect(data.city.region_ids[hit.r][hit.c]);
        }}
      />
      {hover && (
        <p
          className="pointer-events-none absolute z-10 -translate-x-1/2 whitespace-nowrap rounded-sm bg-ink px-2 py-1 text-sm text-panel"
          style={{ left: `${((hover.c + 0.5) / cols) * 100}%`, top: `calc(${((hover.r + 1) / rows) * 100}% + 4px)` }}
        >
          {data.city.region_ids[hover.r][hover.c]}: {formatDepthCm(water[hover.r][hover.c])} cm, {RISK[risks[hover.r][hover.c]].label.toLowerCase()}
        </p>
      )}
    </div>
  );
}
