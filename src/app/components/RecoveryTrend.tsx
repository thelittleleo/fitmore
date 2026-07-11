"use client";

import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import type { ScoreDay } from "@/lib/types";

const bandColor = { green: "var(--good)", yellow: "var(--warn)", red: "var(--bad)" } as const;

function fmtDay(d: string): string {
  const [, mo, da] = d.split("-");
  return `${Number(mo)}/${Number(da)}`;
}

export function RecoveryTrend({ history }: { history: ScoreDay[] }) {
  const data = history.slice(-30);

  const TrendTooltip = ({
    active,
    payload,
    label,
  }: {
    active?: boolean;
    label?: string | number;
    payload?: ReadonlyArray<{ payload?: ScoreDay }>;
  }) => {
    if (!active || !payload || payload.length === 0) return null;
    const p = payload[0].payload;
    if (!p) return null;
    return (
      <div className="chart-tip">
        <div className="tip-day">{String(label ?? "")}</div>
        <div className="tip-val">{p.recovery}% recovery</div>
        <div className="tip-meta">
          <span>strain {p.strain.toFixed(1)}</span>
          <span>sleep {p.sleepPerformance}%</span>
          {p.band && <span className={`tip-flag ${p.band}`}>{p.band}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="trend-card">
      <div className="section-title">Recovery history</div>
      <ResponsiveContainer width="100%" height={150}>
        <BarChart data={data} margin={{ top: 6, right: 6, bottom: 0, left: -20 }} barCategoryGap="18%">
          {/* WHOOP-style band thresholds */}
          <ReferenceLine y={67} stroke="var(--good)" strokeDasharray="3 3" strokeOpacity={0.5} />
          <ReferenceLine y={34} stroke="var(--bad)" strokeDasharray="3 3" strokeOpacity={0.5} />
          <Bar dataKey="recovery" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.day} fill={d.band ? bandColor[d.band] : "var(--ink-faint)"} />
            ))}
          </Bar>
          <XAxis
            dataKey="day"
            tickFormatter={fmtDay}
            tick={{ fontSize: 10, fill: "var(--ink-faint)" }}
            minTickGap={22}
            axisLine={{ stroke: "var(--line)" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 34, 67, 100]}
            width={34}
            tick={{ fontSize: 10, fill: "var(--ink-faint)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={TrendTooltip} cursor={{ fill: "var(--surface-2)" }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
