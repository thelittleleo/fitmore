import { pool, query } from "@/lib/db";
import {
  METRICS,
  METRIC_BY_KEY,
  severityFor,
  flagFor,
  type MetricKey,
  type Trend,
} from "@/lib/metrics";

// The deterministic engine. This is the cheap, exact, $0 part: for every
// person/metric/day it computes a trailing baseline, a z-score against it, a
// direction-aware flag, and a short-term trend. No AI involved.

const BASELINE_WINDOW = 28; // days of history the baseline is drawn from
const MIN_BASELINE = 7; // need at least this many prior days to judge

interface Row {
  ts: Date;
  value: number;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs: number[], m: number): number {
  if (xs.length < 2) return 0;
  const variance = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

function trendOf(series: number[]): Trend {
  // Compare the last 7 days to the prior 7 days, scaled by variability.
  if (series.length < 8) return "flat";
  const recent = series.slice(-7);
  const prior = series.slice(-14, -7);
  if (prior.length === 0) return "flat";
  const rm = mean(recent);
  const pm = mean(prior);
  const sd = stddev(series, mean(series)) || 1;
  const delta = (rm - pm) / sd;
  if (delta > 0.4) return "up";
  if (delta < -0.4) return "down";
  return "flat";
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function summarizeMetric(personId: string, metric: MetricKey): Promise<void> {
  const rows = await query<Row>(
    `select ts, value from raw_samples
     where person_id = $1 and metric = $2
     order by ts asc`,
    [personId, metric],
  );
  if (rows.length === 0) return;

  const def = METRIC_BY_KEY[metric];
  const values = rows.map((r) => Number(r.value));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (let i = 0; i < rows.length; i++) {
      const priorStart = Math.max(0, i - BASELINE_WINDOW);
      const prior = values.slice(priorStart, i);

      let baselineMean: number | null = null;
      let baselineSd: number | null = null;
      let z: number | null = null;
      let severity = 0;
      let flag: string = "normal";

      if (prior.length >= MIN_BASELINE) {
        baselineMean = mean(prior);
        baselineSd = stddev(prior, baselineMean);
        if (baselineSd > 0) {
          z = (values[i] - baselineMean) / baselineSd;
          severity = severityFor(def, z);
          flag = flagFor(def, severity);
        }
      }

      const trend = trendOf(values.slice(0, i + 1));

      await client.query(
        `insert into daily_summaries
           (person_id, metric, day, value, baseline_mean, baseline_sd, z, severity, flag, trend)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict (person_id, metric, day) do update set
           value = excluded.value, baseline_mean = excluded.baseline_mean,
           baseline_sd = excluded.baseline_sd, z = excluded.z,
           severity = excluded.severity, flag = excluded.flag, trend = excluded.trend`,
        [
          personId, metric, dayKey(rows[i].ts), values[i],
          baselineMean, baselineSd, z, severity, flag, trend,
        ],
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function summarizeAll(): Promise<void> {
  const persons = await query<{ id: string }>("select id from persons");
  for (const p of persons) {
    for (const def of METRICS) {
      await summarizeMetric(p.id, def.key);
    }
  }
}
