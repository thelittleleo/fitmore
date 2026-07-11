import Anthropic from "@anthropic-ai/sdk";
import { query } from "@/lib/db";
import { METRIC_BY_KEY, formatValue, type MetricKey, type Flag, type Trend } from "@/lib/metrics";
import type { InsightPayload } from "@/lib/types";

// The AI layer — deliberately thin. It never sees raw time-series; it reads a
// few hundred tokens of pre-computed summary and writes a narrative. It runs on
// a schedule and caches its output, so page loads never spend a token. And with
// no API key set it degrades to a rules-based narrative that costs nothing.

interface MetricRoll {
  key: MetricKey;
  label: string;
  unit: string;
  latest: number;
  avg7: number;
  avg28: number;
  baselineMean: number | null;
  flag: Flag;
  trend: Trend;
}

interface PersonRoll {
  person: { id: string; name: string; isCardiacPatient: boolean };
  periodEnd: string;
  recovery: number | null;
  recoveryBand: string | null;
  strain: number | null;
  sleepPerformance: number | null;
  metrics: MetricRoll[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

async function buildRoll(personId: string): Promise<PersonRoll | null> {
  const [person] = await query<{
    id: string;
    display_name: string;
    is_cardiac_patient: boolean;
  }>(`select id, display_name, is_cardiac_patient from persons where id = $1`, [personId]);
  if (!person) return null;

  const rows = await query<{
    metric: MetricKey;
    day: string;
    value: number;
    baseline_mean: number | null;
    flag: Flag;
    trend: Trend;
  }>(
    `select metric, day::text, value, baseline_mean, flag, trend
     from daily_summaries where person_id = $1 order by day asc`,
    [personId],
  );
  if (rows.length === 0) return null;

  const byMetric = new Map<MetricKey, typeof rows>();
  for (const r of rows) {
    if (!byMetric.has(r.metric)) byMetric.set(r.metric, []);
    byMetric.get(r.metric)!.push(r);
  }

  let periodEnd = "";
  const metrics: MetricRoll[] = [];
  for (const [key, series] of byMetric) {
    const def = METRIC_BY_KEY[key];
    if (!def) continue;
    const last = series[series.length - 1];
    periodEnd = periodEnd > last.day ? periodEnd : last.day;
    metrics.push({
      key,
      label: def.label,
      unit: def.unit,
      latest: Number(last.value),
      avg7: Number(avg(series.slice(-7).map((r) => Number(r.value))).toFixed(1)),
      avg28: Number(avg(series.slice(-28).map((r) => Number(r.value))).toFixed(1)),
      baselineMean: last.baseline_mean === null ? null : Number(last.baseline_mean),
      flag: last.flag,
      trend: last.trend,
    });
  }
  const [sc] = await query<{
    recovery: number | null;
    recovery_band: string | null;
    strain: number;
    sleep_performance: number;
  }>(
    `select recovery, recovery_band, strain, sleep_performance
     from daily_scores where person_id = $1 and recovery is not null
     order by day desc limit 1`,
    [personId],
  );

  return {
    person: { id: person.id, name: person.display_name, isCardiacPatient: person.is_cardiac_patient },
    periodEnd,
    recovery: sc?.recovery ?? null,
    recoveryBand: sc?.recovery_band ?? null,
    strain: sc ? Number(sc.strain) : null,
    sleepPerformance: sc?.sleep_performance ?? null,
    metrics,
  };
}

// ---- Rules-based narrative (the $0 floor) ------------------------------------

function rulesNarrative(roll: PersonRoll): InsightPayload {
  const alerts = roll.metrics.filter((m) => m.flag === "alert");
  const watches = roll.metrics.filter((m) => m.flag === "watch");
  const name = roll.person.name;

  const trendPhrase = (m: MetricRoll) =>
    `${m.label} is ${m.trend === "flat" ? "steady" : m.trend === "up" ? "trending up" : "trending down"} ` +
    `(now ${formatValue(METRIC_BY_KEY[m.key], m.latest)}, 7-day avg ${m.avg7})`;

  const observations: string[] = [];
  if (roll.recovery !== null) {
    observations.push(
      `Recovery ${roll.recovery}% (${roll.recoveryBand})` +
        (roll.strain !== null ? `, day strain ${roll.strain.toFixed(1)}` : "") +
        (roll.sleepPerformance !== null ? `, sleep ${roll.sleepPerformance}% of need` : "") +
        ".",
    );
  }
  observations.push(
    ...roll.metrics
      .filter((m) => m.flag !== "normal" || m.trend !== "flat")
      .slice(0, 4)
      .map(trendPhrase),
  );
  if (observations.length === 0) {
    observations.push("All tracked metrics are within their usual range this week.");
  }

  const watch_items = [...alerts, ...watches].map((m) =>
    `${m.label}: ${formatValue(METRIC_BY_KEY[m.key], m.latest)} vs baseline ` +
    `${m.baselineMean !== null ? m.baselineMean.toFixed(0) : "—"}` +
    (m.flag === "alert" ? " — worth mentioning to a clinician." : " — keep an eye on it."),
  );

  let headline: string;
  let summary: string;
  if (alerts.length > 0) {
    headline = `${name}: ${alerts.length} metric${alerts.length > 1 ? "s" : ""} outside the usual range`;
    summary =
      `This week ${name} has ${alerts.length} reading${alerts.length > 1 ? "s" : ""} notably away from ` +
      `personal baseline` +
      (roll.person.isCardiacPatient
        ? `. Given ${name}'s cardiac history, treat these as prompts to check in with the cardiologist, not diagnoses.`
        : `. These are worth watching but not alarming on their own.`);
  } else if (watches.length > 0) {
    headline = `${name}: mostly steady, a couple to watch`;
    summary = `${name}'s week looks broadly normal, with ${watches.length} metric${watches.length > 1 ? "s" : ""} drifting a little from baseline.`;
  } else {
    headline = `${name}: a steady week`;
    summary = `Everything ${name} tracked stayed within the usual personal range this week.`;
  }

  return {
    headline,
    summary,
    observations,
    watch_items,
    encouragement:
      watches.length + alerts.length === 0
        ? "Nice consistency — keep the routine going."
        : "Small shifts are normal; consistency over weeks is what matters most.",
  };
}

// ---- Claude narrative --------------------------------------------------------

const SYSTEM_PROMPT = `You are Fitmore's health-data explainer. You receive a compact weekly summary of one person's wearable metrics (already aggregated — you never see raw data) and write a short, warm, plain-language readout.

The summary may include a WHOOP-style recovery score (0-100, band green/yellow/red — a composite of HRV, resting HR, sleep and temperature vs the person's baseline), a day strain (0-21 cardiovascular load), and sleep performance (% of need). Lead with recovery when present, in plain language.

Rules:
- You are decision-support, NOT a doctor. Never diagnose, never prescribe.
- Ground every observation in the numbers provided. Do not invent metrics.
- If the person is a cardiac patient, be especially careful: frame any 'alert' as a reason to check in with their cardiologist, never as a conclusion.
- For any metric flagged 'alert', include it in watch_items and suggest discussing it with a clinician.
- Keep it concise and human. No jargon dumps, no false reassurance, no alarm.`;

const RESPONSE_SHAPE = `{
  "headline": "string",
  "summary": "string",
  "observations": ["2-5 short items, each grounded in the numbers"],
  "watch_items": ["0-4 items; include anything flagged 'alert'"],
  "encouragement": "string"
}`;

// Pull the JSON object out of the model's text, tolerating any stray prose or
// markdown fence. Throws on failure, which the caller turns into a rules fallback.
function extractJson(text: string): InsightPayload {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("no JSON object in response");
  return JSON.parse(text.slice(start, end + 1)) as InsightPayload;
}

async function claudeNarrative(roll: PersonRoll, model: string): Promise<InsightPayload> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model,
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content:
          `Write this week's readout for ${roll.person.name}` +
          (roll.person.isCardiacPatient ? " (post-bypass cardiac patient)" : "") +
          `.\n\nRespond with ONLY a JSON object of exactly this shape — no prose, no markdown fence:\n${RESPONSE_SHAPE}\n\nSummary JSON:\n${JSON.stringify(roll, null, 2)}`,
      },
    ],
  });
  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("no text block in response");
  return extractJson(text.text);
}

// ---- Orchestration -----------------------------------------------------------

export async function generateInsights(): Promise<void> {
  const persons = await query<{ id: string }>("select id from persons");
  const hasKey = !!process.env.ANTHROPIC_API_KEY;
  const model = process.env.INSIGHT_MODEL ?? "claude-haiku-4-5";

  for (const { id } of persons) {
    const roll = await buildRoll(id);
    if (!roll) continue;

    let payload: InsightPayload;
    let generatedBy: "claude" | "rules";
    let usedModel: string | null;

    if (hasKey) {
      try {
        payload = await claudeNarrative(roll, model);
        generatedBy = "claude";
        usedModel = model;
      } catch (err) {
        console.warn(`  Claude call failed for ${id}, using rules fallback:`, (err as Error).message);
        payload = rulesNarrative(roll);
        generatedBy = "rules";
        usedModel = null;
      }
    } else {
      payload = rulesNarrative(roll);
      generatedBy = "rules";
      usedModel = null;
    }

    await query(
      `insert into insights (person_id, period_end, generated_by, model, payload)
       values ($1, $2, $3, $4, $5)
       on conflict (person_id, period_end, generated_by)
       do update set model = excluded.model, payload = excluded.payload, created_at = now()`,
      [id, roll.periodEnd, generatedBy, usedModel, JSON.stringify(payload)],
    );
    console.log(`  insight for ${id} via ${generatedBy}${usedModel ? ` (${usedModel})` : ""}`);
  }
}
