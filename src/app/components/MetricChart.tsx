"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Flag } from "@/lib/metrics";
import type { MetricView } from "@/lib/types";

const flagColor: Record<Flag, string> = {
  normal: "var(--spark-normal)",
  watch: "var(--spark-watch)",
  alert: "var(--spark-alert)",
};
const trendGlyph = { up: "↑", down: "↓", flat: "→" } as const;

function fmtDay(d: string): string {
  const [, mo, da] = d.split("-");
  return `${Number(mo)}/${Number(da)}`;
}

export function MetricChart({ m, days }: { m: MetricView; days: number }) {
  const data = m.points.slice(-days);
  const fmt = (v: number) => v.toFixed(m.decimals);

  // Colored, larger dots only on flagged days; the line itself stays neutral.
  const renderDot = (props: { cx?: number; cy?: number; payload?: { flag: Flag; day: string } }) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || !payload || payload.flag === "normal") {
      return <g key={payload?.day} />;
    }
    return (
      <circle
        key={payload.day}
        cx={cx}
        cy={cy}
        r={payload.flag === "alert" ? 3.6 : 3}
        fill={flagColor[payload.flag]}
        stroke="var(--surface)"
        strokeWidth={1}
      />
    );
  };

  const ChartTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    label?: string | number;
    payload?: ReadonlyArray<{ payload?: MetricView["points"][number] }>;
  }) => {
    if (!active || !payload || payload.length === 0) return null;
    const p = payload[0].payload;
    if (!p) return null;
    return (
      <div className="chart-tip">
        <div className="tip-day">{String(label ?? "")}</div>
        <div className="tip-val">
          {fmt(p.value)}
          {m.unit ? ` ${m.unit}` : ""}
        </div>
        <div className="tip-meta">
          {p.z != null && <span>z {p.z.toFixed(1)}</span>}
          {p.band && (
            <span>
              usual {fmt(p.band[0])}–{fmt(p.band[1])}
            </span>
          )}
          {p.flag !== "normal" && <span className={`tip-flag ${p.flag}`}>{p.flag}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className={`chart-card flag-${m.flag}`}>
      <div className="chart-head">
        <span className="chart-label">{m.label}</span>
        <span className="chart-value">
          {fmt(m.latest)}
          {m.unit && <span className="unit"> {m.unit}</span>}
        </span>
      </div>
      <div className="chart-sub">
        {m.flag !== "normal" && <span className={`pill ${m.flag}`}>{m.flag}</span>}
        <span className="trend">
          {trendGlyph[m.trend]} {m.trend}
        </span>
        {m.baselineMean != null && <span className="trend">base {fmt(m.baselineMean)}</span>}
      </div>

      <div className="chart-body">
        <ResponsiveContainer width="100%" height={140}>
          <ComposedChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -18 }}>
            {/* Personal "usual range" (baseline ± 2 SD) as a soft band. */}
            <Area
              dataKey="band"
              stroke="none"
              fill="var(--accent)"
              fillOpacity={0.1}
              isAnimationActive={false}
              connectNulls={false}
            />
            <Line
              dataKey="value"
              stroke="var(--accent)"
              strokeWidth={1.8}
              dot={renderDot}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            <XAxis
              dataKey="day"
              tickFormatter={fmtDay}
              tick={{ fontSize: 10, fill: "var(--ink-faint)" }}
              minTickGap={26}
              axisLine={{ stroke: "var(--line)" }}
              tickLine={false}
            />
            <YAxis
              width={40}
              tick={{ fontSize: 10, fill: "var(--ink-faint)" }}
              tickCount={4}
              domain={["auto", "auto"]}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={ChartTooltip} cursor={{ stroke: "var(--line)" }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
