import { pool, query } from "@/lib/db";
import type { MetricKey } from "@/lib/metrics";
import type { RecoveryBand } from "@/lib/types";

// WHOOP-style daily scores, computed from the deterministic baselines we already
// have. These are our OWN composites — the same *inputs* WHOOP uses (HRV,
// resting HR, sleep, temperature), not their proprietary formula. Directionally
// comparable, transparently defined here.

const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

// Map a z-score to 0..1 where 1 = best. `good` says which direction is healthy.
// Being *at* your own baseline is healthy, so z = 0 lands high (~0.72), not 0.5;
// each standard deviation above/below your norm moves it ±0.22.
export function fromZ(z: number, good: "high" | "low"): number {
  const s = good === "high" ? z : -z; // higher-is-better vs lower-is-better
  return clamp(0.72 + s * 0.22); // z = 0 → 0.72, z = +1.3 → 1.0, z = -2 → 0.28
}

export function recoveryBand(recovery: number): RecoveryBand {
  if (recovery >= 67) return "green";
  if (recovery >= 34) return "yellow";
  return "red";
}

interface Cell {
  value: number;
  mean: number | null;
  sd: number | null;
  z: number | null;
}
type DayCells = Partial<Record<MetricKey, Cell>>;

interface Scores {
  recovery: number | null;
  band: RecoveryBand | null;
  strain: number;
  sleepPerformance: number;
  sleepNeed: number | null;
  sleepMinutes: number | null;
}

// Exported so it's easy to reason about / unit test in isolation.
export function scoresForDay(c: DayCells): Scores {
  const hrv = c.hrv;
  const rhr = c.resting_hr;
  const temp = c.skin_temp_delta;
  const sleep = c.sleep_minutes;

  // ---- Sleep performance: achieved vs personal need (trailing baseline). ----
  const sleepMinutes = sleep ? sleep.value : null;
  const sleepNeed = sleep ? (sleep.mean ?? sleep.value) : null;
  const sleepRatio = sleep && sleepNeed ? sleep.value / sleepNeed : 1;
  const sleepPerformance = Math.round(100 * clamp(sleepRatio, 0, 1.2));

  // ---- Strain (0..21): cardiovascular load, mostly active-zone minutes. ----
  const azm = c.active_zone_minutes?.value ?? 0;
  const steps = c.steps?.value ?? 0;
  const load = azm + steps / 1500;
  const strain = Math.round(21 * (1 - Math.exp(-load / 40)) * 10) / 10;

  // ---- Recovery (0..100): needs HRV and resting HR baselines to be meaningful.
  let recovery: number | null = null;
  let band: RecoveryBand | null = null;
  if (hrv && hrv.z !== null && rhr && rhr.z !== null) {
    const hrvScore = fromZ(hrv.z, "high");
    const rhrScore = fromZ(rhr.z, "low");
    const sleepScore = clamp(sleepRatio, 0, 1);
    const tempScore = temp && temp.z !== null ? clamp(1 - Math.abs(temp.z) / 2.5) : 0.6;
    recovery = Math.round(
      100 * (0.4 * hrvScore + 0.25 * rhrScore + 0.25 * sleepScore + 0.1 * tempScore),
    );
    band = recoveryBand(recovery);
  }

  return { recovery, band, strain, sleepPerformance, sleepNeed, sleepMinutes };
}

export async function computeScores(): Promise<void> {
  const persons = await query<{ id: string }>("select id from persons");

  for (const { id } of persons) {
    const rows = await query<{
      metric: MetricKey;
      day: string;
      value: number;
      baseline_mean: number | null;
      baseline_sd: number | null;
      z: number | null;
    }>(
      `select metric, day::text, value, baseline_mean, baseline_sd, z
       from daily_summaries where person_id = $1 order by day asc`,
      [id],
    );

    const byDay = new Map<string, DayCells>();
    for (const r of rows) {
      if (!byDay.has(r.day)) byDay.set(r.day, {});
      byDay.get(r.day)![r.metric] = {
        value: Number(r.value),
        mean: r.baseline_mean === null ? null : Number(r.baseline_mean),
        sd: r.baseline_sd === null ? null : Number(r.baseline_sd),
        z: r.z === null ? null : Number(r.z),
      };
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const [day, cells] of byDay) {
        const s = scoresForDay(cells);
        await client.query(
          `insert into daily_scores
             (person_id, day, recovery, recovery_band, strain, sleep_performance, sleep_need, sleep_minutes)
           values ($1,$2,$3,$4,$5,$6,$7,$8)
           on conflict (person_id, day) do update set
             recovery = excluded.recovery, recovery_band = excluded.recovery_band,
             strain = excluded.strain, sleep_performance = excluded.sleep_performance,
             sleep_need = excluded.sleep_need, sleep_minutes = excluded.sleep_minutes`,
          [id, day, s.recovery, s.band, s.strain, s.sleepPerformance, s.sleepNeed, s.sleepMinutes],
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
}
