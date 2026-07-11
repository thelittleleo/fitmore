# Fitmore

Personal health intelligence: pull wearable data (Fitbit Air, via the Google
Health API), compute health baselines locally, and use Claude to turn the
numbers into a plain-language weekly readout. Built solo, personal-first —
for me and my mother (a post-bypass cardiac patient).

**Architecture:** see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) (or open
`docs/architecture.html` in a browser).

> **M1 status — this runs today on *mock* data.** The Fitbit Air isn't wired in
> yet; a synthetic adapter produces data shaped exactly like the real Google
> Health API will. The whole pipeline (ingest → store → baselines → insight →
> dashboard) is live. When the device arrives, we swap **one adapter** and
> change nothing else.

---

## What's here

```
Mock adapter → Postgres → baselines + WHOOP-style scores → insight (Claude or free) → dashboard
```

- **Deterministic engine** (`src/engine/summarize.ts`) — trailing baselines,
  z-scores, direction-aware flags (`normal` / `watch` / `alert`) and trends.
  This is the exact, cheap, **$0** part. It runs with no AI at all.
- **Scores engine** (`src/engine/scores.ts`) — WHOOP-style daily **Recovery %**
  (our own composite of HRV, resting HR, sleep and skin temp vs personal
  baseline), **Day Strain** (0–21 cardiovascular load), and **Sleep
  Performance** (% of need). Transparent formulas, not WHOOP's proprietary ones.
- **Dashboard** — WHOOP-style: three big Recovery / Strain / Sleep rings, a
  colored recovery-history chart, then interactive per-metric "Vitals" charts.
- **Insight engine** (`src/engine/insight.ts`) — reads a compact *summary* (not
  raw data), writes a short narrative, and **caches it** to the DB.
  - No `ANTHROPIC_API_KEY` set → a rules-based narrative is generated for free.
  - Key set → Claude writes it (Haiku by default; see below).
- **Dashboard** (`src/app/page.tsx`) — reads cached summaries + insights. It
  **never calls Claude on page load**, so it's fast and costs nothing to view.

---

## Prerequisites

- Node 22+
- Postgres — either Docker (compose file included) or any Postgres 16 you point
  `DATABASE_URL` at.

## Quick start

```bash
cp .env.example .env      # then edit if needed (see note below)
npm install
npm run db:up             # starts Postgres in Docker
npm run pipeline          # migrate + mock-ingest + summarize + insight
npm run dev               # http://localhost:3000
```

> **Port note:** if you already run Postgres on 5432, the container will fail to
> bind. Set a free port in `.env` — `DB_PORT=5433` and match it in
> `DATABASE_URL` (`...@localhost:5433/fitmore`). compose reads `DB_PORT`
> automatically. (This repo's `.env` is already set to 5433 for exactly that
> reason.)

## Turn on Claude-written insights

Insights work for free out of the box (rules engine). To have Claude write them:

```bash
# in .env
ANTHROPIC_API_KEY=sk-ant-...
INSIGHT_MODEL=claude-haiku-4-5   # cheap default; use claude-opus-4-8 for a deep dive
```

Then re-run `npm run insight` (or the whole `npm run pipeline`). For two people
with one weekly summary each, the cost is pennies a month. The dashboard shows
which engine produced each insight (`Claude · <model>` or `rules · free`).

---

## Scripts

| Command             | What it does |
|---------------------|--------------|
| `npm run db:up`     | Start Postgres (Docker) |
| `npm run db:down`   | Stop it |
| `npm run db:migrate`| Apply `db/schema.sql` |
| `npm run seed`      | Ingest mock data (`MOCK_DAYS`, default 35) |
| `npm run summarize` | Compute baselines + flags |
| `npm run scores`    | Compute recovery / strain / sleep scores |
| `npm run insight`   | Generate/cache insights |
| `npm run pipeline`  | All of the above, in order |
| `npm run dev`       | Next.js dev server |

## Layout

```
db/schema.sql              canonical tables (persons, raw_samples, daily_summaries, insights)
src/lib/                   metrics catalog, db client, shared types, dashboard queries
src/ingest/adapters/       DataSource interface + mock Fitbit Air (real adapters slot in here)
src/ingest/ingest.ts       normalize → raw_samples
src/engine/summarize.ts    raw_samples → daily_summaries (+ flags) — deterministic, $0
src/engine/insight.ts      summaries → cached narrative (Claude or rules)
src/scripts/               migrate / seed / run-summaries / run-insights / pipeline
src/app/                   Next.js dashboard
docs/                      architecture (md + html)
```

## Roadmap

- **M1 (done)** — mock → pipeline → dashboard, end to end.
- **M2 (done)** — interactive Recharts (baseline band, flagged points, range toggle).
- **M3 (done)** — WHOOP-style Recovery / Strain / Sleep scores + rings + recovery history.
- **M4** — behavior journal + Claude "what moves your recovery" correlations; scheduled insights.
- **M5** — near-real-time webhooks + anomaly alerts.
- **M5** — real Google Health API adapter for the Fitbit Air; later a Huawei
  Watch D2 adapter for validated blood pressure (for Mum); open it up to others.

---

**Cardiac-care note:** this is tracking and decision-support, **not diagnosis**.
Flags are a prompt to talk to a cardiologist, never a conclusion. Blood pressure,
when added, will come only from a validated cuff device — never an optical estimate.
