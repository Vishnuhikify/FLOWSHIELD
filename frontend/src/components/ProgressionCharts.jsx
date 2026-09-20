import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, RISK } from "../utils/risk";
import { formatPeople } from "../utils/format";

const axis = { stroke: CHART.ink, fontSize: 12, tickLine: false };
const tooltipStyle = { borderRadius: 2, border: `1px solid ${CHART.grid}`, fontSize: 13 };

export default function ProgressionCharts({ data, step, region }) {
  const tl = data.timeline;
  const rows = useMemo(
    () =>
      tl.timestamps.map((t, i) => ({
        t,
        max: tl.max_water[i],
        region: region ? tl.water_levels[i][region.row][region.col] : undefined,
        warning: tl.warning_population[i],
        critical: tl.critical_population[i],
      })),
    [tl, region]
  );
  const now = tl.timestamps[step];
  const { warning_threshold: warn, critical_threshold: crit } = data.config;
  const yMax = Math.ceil(Math.max(crit * 1.15, ...tl.max_water) * 10) / 10; // round up to a clean 0.1 m

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <figure>
        <figcaption className="mb-2 font-medium">Water depth over time (m)</figcaption>
        <div className="h-60">
          <ResponsiveContainer>
            <LineChart data={rows} margin={{ top: 18, right: 56, bottom: 0, left: -18 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} {...axis} unit=" min" />
              <YAxis domain={[0, yMax]} {...axis} tickFormatter={(v) => v.toFixed(1)} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(t) => `${t} min`} formatter={(v) => `${Number(v).toFixed(3)} m`} />
              <ReferenceLine y={warn} stroke={RISK.WARNING.fill} strokeWidth={1.5} label={{ value: "Warning", position: "right", fill: RISK.WARNING.hex, fontSize: 12 }} />
              <ReferenceLine y={crit} stroke={RISK.CRITICAL.hex} strokeWidth={1.5} label={{ value: "Critical", position: "right", fill: RISK.CRITICAL.hex, fontSize: 12 }} />
              <ReferenceLine x={now} stroke={CHART.region} strokeDasharray="3 3" label={{ value: "Now", position: "top", fill: CHART.region, fontSize: 12 }} />
              <Line name="Deepest region" dataKey="max" stroke={CHART.water} strokeWidth={2.5} dot={false} isAnimationActive={false} />
              {region && <Line name={`Region ${region.id}`} dataKey="region" stroke={CHART.region} strokeWidth={2} strokeDasharray="6 3" dot={false} isAnimationActive={false} />}
              <Legend iconType="plainline" wrapperStyle={{ fontSize: 13 }} formatter={(v) => <span style={{ color: "#10273d" }}>{v}</span>} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </figure>

      <figure>
        <figcaption className="mb-2 font-medium">People in flooded regions at each moment</figcaption>
        <div className="h-60">
          <ResponsiveContainer>
            <AreaChart data={rows} margin={{ top: 18, right: 16, bottom: 0, left: 4 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="t" type="number" domain={[0, "dataMax"]} {...axis} unit=" min" />
              <YAxis {...axis} tickFormatter={formatPeople} allowDecimals={false} />
              <Tooltip contentStyle={tooltipStyle} labelFormatter={(t) => `${t} min`} formatter={(v) => formatPeople(v)} />
              <ReferenceLine x={now} stroke={CHART.region} strokeDasharray="3 3" label={{ value: "Now", position: "top", fill: CHART.region, fontSize: 12 }} />
              <Area name="Critical" dataKey="critical" stackId="p" stroke={RISK.CRITICAL.hex} fill={RISK.CRITICAL.hex} fillOpacity={0.85} isAnimationActive={false} type="stepAfter" />
              <Area name="Warning" dataKey="warning" stackId="p" stroke={RISK.WARNING.fill} fill={RISK.WARNING.fill} fillOpacity={0.8} isAnimationActive={false} type="stepAfter" />
              <Legend iconType="square" wrapperStyle={{ fontSize: 13 }} formatter={(v) => <span style={{ color: "#10273d" }}>{v}</span>} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </figure>
    </div>
  );
}
