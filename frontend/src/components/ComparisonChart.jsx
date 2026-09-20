import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_SERIES, chartRows } from "../utils/comparison";
import { formatPeople } from "../utils/format";
import { CHART, RISK } from "../utils/risk";

const axis = { stroke: CHART.ink, fontSize: 12, tickLine: false };

export default function ComparisonChart({ comparison }) {
  const [series, setSeries] = useState(CHART_SERIES[0].value);
  const spec = CHART_SERIES.find((s) => s.value === series);
  const rows = useMemo(() => chartRows(comparison.timeline, series), [comparison, series]);
  const depth = spec.unit === "m";
  const fmt = depth ? (v) => `${Number(v).toFixed(3)} m` : (v) => formatPeople(v);

  return (
    <figure>
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{spec.label} over time, without and with the plan</span>
        <span role="radiogroup" aria-label="Chart series" className="seg">
          {CHART_SERIES.map((s) => (
            <button key={s.value} type="button" role="radio" aria-checked={series === s.value} onClick={() => setSeries(s.value)}>
              {s.label}
            </button>
          ))}
        </span>
      </figcaption>
      <div className="h-64">
        <ResponsiveContainer>
          <LineChart data={rows} margin={{ top: 8, right: 56, bottom: 0, left: depth ? -18 : 4 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} {...axis} unit=" min" />
            <YAxis {...axis} tickFormatter={depth ? (v) => v.toFixed(1) : formatPeople} allowDecimals={depth} />
            <Tooltip contentStyle={{ borderRadius: 2, border: `1px solid ${CHART.grid}`, fontSize: 13 }} labelFormatter={(t) => `${t} min`} formatter={fmt} />
            {depth && <ReferenceLine y={comparison.config.warning_threshold} stroke={RISK.WARNING.fill} label={{ value: "Warning", position: "right", fill: RISK.WARNING.hex, fontSize: 12 }} />}
            {depth && <ReferenceLine y={comparison.config.critical_threshold} stroke={RISK.CRITICAL.hex} label={{ value: "Critical", position: "right", fill: RISK.CRITICAL.hex, fontSize: 12 }} />}
            <Line name="Without plan" dataKey="without" stroke={CHART.ink} strokeWidth={2} strokeDasharray="6 3" dot={false} isAnimationActive={false} type={depth ? "linear" : "stepAfter"} />
            <Line name="With plan" dataKey="with" stroke={RISK.SAFE.hex} strokeWidth={2.5} dot={false} isAnimationActive={false} type={depth ? "linear" : "stepAfter"} />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 13 }} formatter={(v) => <span style={{ color: "#10273d" }}>{v}</span>} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}
