import type { MetricKey, Flag, Trend } from "./metrics";

// The canonical sample shape. Every data source normalizes into this before
// anything downstream touches it.
export interface HealthSample {
  personId: string;
  metric: MetricKey;
  ts: Date;
  value: number;
  unit: string;
}

export interface Person {
  id: string;
  displayName: string;
  isCardiacPatient: boolean;
}

// One computed row from daily_summaries.
export interface DailySummary {
  personId: string;
  metric: MetricKey;
  day: string; // ISO date
  value: number;
  baselineMean: number | null;
  baselineSd: number | null;
  z: number | null;
  flag: Flag;
  trend: Trend;
}

// The structured insight payload, whether written by Claude or the rules engine.
export interface InsightPayload {
  headline: string;
  summary: string;
  observations: string[];
  watch_items: string[];
  encouragement: string;
}

export interface Insight {
  personId: string;
  periodEnd: string;
  generatedBy: "claude" | "rules";
  model: string | null;
  payload: InsightPayload;
}

// ---- View models (safe to import from client components — no server deps) ----

export interface ChartPoint {
  day: string; // ISO date
  value: number;
  /** [lower, upper] = personal baseline ± 2 SD, or null before a baseline exists. */
  band: [number, number] | null;
  flag: Flag;
  z: number | null;
}

export interface MetricView {
  key: MetricKey;
  label: string;
  short: string;
  unit: string;
  decimals: number;
  latest: number;
  baselineMean: number | null;
  flag: Flag;
  trend: Trend;
  points: ChartPoint[];
}

export type InsightView = InsightPayload & {
  generatedBy: "claude" | "rules";
  model: string | null;
};

export interface PersonView {
  id: string;
  name: string;
  isCardiacPatient: boolean;
  periodEnd: string | null;
  metrics: MetricView[];
  insight: InsightView | null;
  worstFlag: Flag;
}
