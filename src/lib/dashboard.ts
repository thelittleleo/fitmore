import { query } from "./db";
import { METRICS, type MetricKey, type Flag, type Trend } from "./metrics";
import type { ChartPoint, InsightPayload, MetricView, PersonView } from "./types";

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
      worstFlag,
      insight: insightRow
        ? { ...insightRow.payload, generatedBy: insightRow.generated_by, model: insightRow.model }
        : null,
    });
  }
  return views;
}
