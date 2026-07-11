// The metric catalog. One place that defines every biometric we track: its
// units, how to display it, and — importantly — which direction is clinically
// concerning, so the deterministic engine can flag anomalies without any AI.

export type MetricKey =
  | "resting_hr"
  | "hrv"
  | "spo2"
  | "skin_temp_delta"
  | "sleep_minutes"
  | "sleep_deep_minutes"
  | "steps"
  | "active_zone_minutes";

// Which direction of deviation from a person's own baseline is a concern.
//   high → higher-than-baseline is worse (e.g. resting heart rate creeping up)
//   low  → lower-than-baseline is worse  (e.g. HRV dropping, SpO2 dipping)
//   abs  → any large deviation either way is worth a look (e.g. skin temp)
//   none → informational only, never flagged (e.g. steps)
export type WorseDirection = "high" | "low" | "abs" | "none";

export interface MetricDef {
  key: MetricKey;
  label: string;
  short: string;
  unit: string;
  decimals: number;
  worse: WorseDirection;
  watchZ: number; // directional |z| at/above which we raise "watch"
  alertZ: number; // ... and "alert"
}

export const METRICS: MetricDef[] = [
  { key: "resting_hr",        label: "Resting heart rate", short: "RHR",   unit: "bpm",   decimals: 0, worse: "high", watchZ: 1.5, alertZ: 2.3 },
  { key: "hrv",               label: "Heart rate variability", short: "HRV", unit: "ms",  decimals: 0, worse: "low",  watchZ: 1.5, alertZ: 2.3 },
  { key: "spo2",              label: "Overnight SpO₂", short: "SpO₂", unit: "%", decimals: 0, worse: "low",  watchZ: 1.8, alertZ: 2.5 },
  { key: "skin_temp_delta",   label: "Skin temp variation", short: "Temp", unit: "°C", decimals: 1, worse: "abs", watchZ: 1.8, alertZ: 2.6 },
  { key: "sleep_minutes",     label: "Sleep",            short: "Sleep",  unit: "min",  decimals: 0, worse: "low",  watchZ: 1.6, alertZ: 2.4 },
  { key: "sleep_deep_minutes",label: "Deep sleep",       short: "Deep",   unit: "min",  decimals: 0, worse: "low",  watchZ: 1.8, alertZ: 2.6 },
  { key: "steps",             label: "Steps",            short: "Steps",  unit: "",     decimals: 0, worse: "none", watchZ: 99,  alertZ: 99 },
  { key: "active_zone_minutes", label: "Active zone minutes", short: "AZM", unit: "min", decimals: 0, worse: "none", watchZ: 99, alertZ: 99 },
];

export const METRIC_BY_KEY: Record<MetricKey, MetricDef> = Object.fromEntries(
  METRICS.map((m) => [m.key, m]),
) as Record<MetricKey, MetricDef>;

export type Flag = "normal" | "watch" | "alert";
export type Trend = "up" | "down" | "flat";

// Convert a raw z-score into a direction-aware severity, then into a flag.
export function severityFor(def: MetricDef, z: number): number {
  switch (def.worse) {
    case "high": return z;      // positive z (above baseline) is the concern
    case "low":  return -z;     // negative z (below baseline) is the concern
    case "abs":  return Math.abs(z);
    case "none": return 0;
  }
}

export function flagFor(def: MetricDef, severity: number): Flag {
  if (def.worse === "none") return "normal";
  if (severity >= def.alertZ) return "alert";
  if (severity >= def.watchZ) return "watch";
  return "normal";
}

export function formatValue(def: MetricDef, value: number): string {
  const n = value.toFixed(def.decimals);
  return def.unit ? `${n} ${def.unit}` : Number(value).toLocaleString();
}
