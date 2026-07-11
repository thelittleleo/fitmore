"use client";

import { useState } from "react";
import type { MetricView } from "@/lib/types";
import { MetricChart } from "./MetricChart";

const RANGES = [
  { label: "14d", n: 14 },
  { label: "30d", n: 30 },
  { label: "All", n: 9999 },
];

export function MetricCharts({ metrics }: { metrics: MetricView[] }) {
  const [days, setDays] = useState(30);
  return (
    <>
      <div className="range-toggle" role="group" aria-label="Time range">
        {RANGES.map((r) => (
          <button
            key={r.label}
            type="button"
            className={days === r.n ? "active" : ""}
            aria-pressed={days === r.n}
            onClick={() => setDays(r.n)}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div className="chart-grid">
        {metrics.map((m) => (
          <MetricChart key={m.key} m={m} days={days} />
        ))}
      </div>
    </>
  );
}
