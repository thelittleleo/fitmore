# Fitmore — Architecture

A private web app that pulls Fitbit Air data (for me + my mother), computes health
baselines locally, and uses Claude to turn the numbers into plain-language insight.
Built solo, personal-first, designed to open up later.

> Interactive version of this doc: `docs/architecture.html` (open in a browser).

**Stack at a glance:** Web app · Next.js + TypeScript · Google Health API · Postgres · Claude API · 2 users → many

---

## The system — five layers, one direction of flow

Data moves top to bottom. Each connector is the *contract* passed between layers —
the seam you can build and test in isolation.

```
L1  SOURCE          Fitbit Air  (HR/HRV, SpO2, skin temp, sleep, steps)
                    [ Huawei Watch D2 — reserved slot, Phase 5 ]
     │  encrypted BLE → Fitbit cloud (you never touch the raw radio)
     ▼
L2  INGESTION       Google Health API (OAuth 2.0, webhooks, intraday, ~150 req/hr/user)
                    Sync worker (cron + webhook, encrypted token vault)
                    Normalization adapter (vendor payload → canonical schema)
     │  canonical samples — {user, metric, value, unit, ts, source}
     ▼
L3  STORAGE         Postgres — raw_samples · daily_summaries · insights · accounts
                    (optional object cache for hot aggregates)
     │  aggregates read by processing — never the raw firehose
     ▼
L4  PROCESSING      Deterministic engine (rolling avg, HRV baseline, sleep debt, rule flags)
                    Claude insight engine (reads summaries, prompt caching, scheduled)
     │  insight JSON — narrative, trend verdicts, flags (persisted, not live)
     ▼
L5  PRESENTATION    Web dashboard (Next.js) — per-person views, charts, insight cards
                    App API (serves cached data, holds all secrets)

C0  CROSS-CUTTING   consent gate before Claude · tokens encrypted at rest · HTTPS ·
                    Claude key server-side only · audit log of data access
```

---

## Data flow — one sample's journey

1. **Connect** — Authorize Fitbit once via Google OAuth; store an encrypted `refresh_token`.
2. **Ingest** — Webhook (or scheduled pull) fetches new samples; adapter normalizes them.
3. **Store** — Samples land in `raw_samples`. Nothing analyzed yet; this is the durable record.
4. **Summarize** — Nightly job computes rollups, baselines, and anomaly flags → `daily_summaries`.
5. **Interpret** — Weekly job sends *summaries* (not raw data) to Claude; caches narrative → `insights`.
6. **Render** — Dashboard reads cached summaries + insights. Page loads never call Claude.

---

## The four design decisions that shape everything

- **Aggregate before you ask Claude.** Never stream the raw firehose to the model.
  Pre-compute summaries in your own code, then ask Claude to interpret. Cheaper tokens,
  sharper answers, deterministic math stays deterministic.
- **A normalization adapter per source.** Everything above L2 speaks one canonical schema.
  Adding the Huawei Watch D2 (blood pressure) later is a new adapter, not a rewrite.
- **Personal now, reviewed later.** For me + my mother, a personal app gives full, free
  access including intraday data. Opening it to strangers means Google's app review and
  stricter rate-limit handling — a gate, not a paywall.
- **Insights are persisted, not live.** Claude runs on a schedule and writes to the DB;
  the UI reads that cache. Keeps a "free for everyone" version from running up an API bill
  on every page view.

---

## Recommended stack (solo-friendly, boring on purpose)

| Layer            | Pick                          | Why |
|------------------|-------------------------------|-----|
| Frontend + API   | Next.js (TypeScript)          | One codebase for UI + backend route handlers. |
| Database         | Postgres (Supabase / Neon)    | Relational fits summaries + consent; Supabase adds auth & RLS. |
| Scheduling       | Cron worker                   | Nightly summaries + weekly insights. |
| Ingestion        | Google Health API             | Sanctioned Fitbit successor. OAuth 2.0, webhooks, intraday. |
| Insight          | Claude API (Messages)         | Structured summaries in, narrative out. Prompt caching. |
| Charts           | Recharts / visx               | React charting for HR, sleep, HRV, SpO2 trends. |
| Hosting          | Vercel + managed Postgres     | Zero-ops for a solo project. |

---

## Build order — ship a thin slice, then widen it

- **M1** — OAuth + one metric, end to end. Connect Fitbit Air, pull heart rate, store, chart it. Proves the whole pipe.
- **M2** — Summaries + full dashboard. Nightly rollups + baselines for both people; charts for HR, sleep, HRV, SpO2, steps, temp.
- **M3** — Claude weekly readout. Scheduled insight generation, cached, surfaced as cards. First "gold."
- **M4** — Near-real-time + alerts. Webhook ingestion and anomaly banners (resting-HR creep, SpO2 dips, HRV drops).
- **M5** — Add BP source · open to others. Huawei Watch D2 adapter for cuff-grade BP; then Google's review to share.

---

## Cardiac care note

My mother is a post-bypass patient, so this app is **tracking and decision-support, never
diagnosis**. Anomaly flags prompt a conversation with her cardiologist — they don't replace
one. When blood pressure enters the picture, use only a validated cuff device (Watch D2),
never an optical PPG estimate, for any number she or her doctor might act on.
