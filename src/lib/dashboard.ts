import { query } from "./db";
import { fromZ } from "@/engine/scores";
import { METRICS, type MetricKey, type Flag, type Trend } from "./metrics";
import type {
  ChartPoint,
  InsightPayload,
  MetricView,
  PersonView,
  RecoveryBand,
  RecoveryDrivers,
  ScoreDay,
  ScoresView,
} from "./types";

const clamp100 = (x: number) => Math.max(0, Math.min(100, Math.round(x)));

export type { MetricView, PersonView } from "./types";

const flagRank: Record<Flag, number> = { normal: 0, watch: 1, alert: 2 };

export async function getDashboard(): Promise<PersonView[]> {
  const persons = await query<{ id: string; display_name: string; is_cardiac_patient: boolean }>(
    `select id, display_name, is_cardiac_patient from persons order by is_cardiac_patient, id`,
  );

  const views: PersonView[] = [];
  for (const p of persons) {
    const rows = await query<{
      metric: MetricKey;
      day: string;
      value: number;
      baseline_mean: number | null;
      baseline_sd: number | null;
      z: number | null;
      flag: Flag;
      trend: Trend;
    }>(
      `select metric, day::text, value, baseline_mean, baseline_sd, z, flag, trend
       from daily_summaries where person_id = $1 order by day asc`,
      [p.id],
    );

    const byMetric = new Map<MetricKey, typeof rows>();
    for (const r of rows) {
      if (!byMetric.has(r.metric)) byMetric.set(r.metric, []);
      byMetric.get(r.metric)!.push(r);
    }

    let periodEnd: string | null = null;
    let worstFlag: Flag = "normal";
    const metrics: MetricView[] = [];

    for (const def of METRICS) {
      const series = byMetric.get(def.key);
      if (!series || series.length === 0) continue;
      const last = series[series.length - 1];
      if (!periodEnd || last.day > periodEnd) periodEnd = last.day;
      if (flagRank[last.flag] > flagRank[worstFlag]) worstFlag = last.flag;

      const points: ChartPoint[] = series.map((r) => {
        const mean = r.baseline_mean === null ? null : Number(r.baseline_mean);
        const sd = r.baseline_sd === null ? null : Number(r.baseline_sd);
        const band: [number, number] | null =
          mean !== null && sd !== null ? [mean - 2 * sd, mean + 2 * sd] : null;
        return {
          day: r.day,
          value: Number(r.value),
          band,
          flag: r.flag,
          z: r.z === null ? null : Number(r.z),
        };
      });

      metrics.push({
        key: def.key,
        label: def.label,
        short: def.short,
        unit: def.unit,
        decimals: def.decimals,
        latest: Number(last.value),
        baselineMean: last.baseline_mean === null ? null : Number(last.baseline_mean),
        flag: last.flag,
        trend: last.trend,
        points,
      });
    }

    const scoreRows = await query<{
      day: string;
      recovery: number | null;
      recovery_band: RecoveryBand | null;
      strain: number;
      sleep_performance: number;
      sleep_need: number | null;
      sleep_minutes: number | null;
    }>(
      `select day::text, recovery, recovery_band, strain, sleep_performance, sleep_need, sleep_minutes
       from daily_scores where person_id = $1 order by day asc`,
      [p.id],
    );
    const history: ScoreDay[] = scoreRows
      .filter((r) => r.recovery !== null)
      .map((r) => ({
        day: r.day,
        recovery: r.recovery === null ? null : Number(r.recovery),
        band: r.recovery_band,
        strain: Number(r.strain),
        sleepPerformance: Number(r.sleep_performance),
        sleepNeed: r.sleep_need === null ? null : Number(r.sleep_need),
        sleepMinutes: r.sleep_minutes === null ? null : Number(r.sleep_minutes),
      }));
    // What's driving today's recovery: the HRV and resting-HR components (same
    // fromZ the scores engine uses) plus sleep performance, as 0..100 bars.
    const latestScore = history.at(-1) ?? null;
    const hrvZ = byMetric.get("hrv")?.at(-1)?.z ?? null;
    const rhrZ = byMetric.get("resting_hr")?.at(-1)?.z ?? null;
    let drivers: RecoveryDrivers | null = null;
    if (latestScore && hrvZ !== null && rhrZ !== null) {
      drivers = {
        hrv: clamp100(100 * fromZ(Number(hrvZ), "high")),
        rhr: clamp100(100 * fromZ(Number(rhrZ), "low")),
        sleep: clamp100(latestScore.sleepPerformance),
      };
    }
    const scores: ScoresView = { latest: latestScore, history, drivers };

    const [insightRow] = await query<{
      generated_by: "claude" | "rules";
      model: string | null;
      payload: InsightPayload;
    }>(
      `select generated_by, model, payload from insights
       where person_id = $1 order by created_at desc limit 1`,
      [p.id],
    );

    views.push({
      id: p.id,
      name: p.display_name,
      isCardiacPatient: p.is_cardiac_patient,
      periodEnd,
      metrics,
      scores,
      worstFlag,
      insight: insightRow
        ? { ...insightRow.payload, generatedBy: insightRow.generated_by, model: insightRow.model }
        : null,
    });
  }
  return views;
}
