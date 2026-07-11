-- Fitmore canonical schema (M1).
-- Everything above the ingestion layer speaks these tables, so swapping the
-- mock adapter for the real Google Health API adapter changes nothing here.

create table if not exists persons (
  id                 text primary key,
  display_name       text not null,
  is_cardiac_patient boolean not null default false,
  created_at         timestamptz not null default now()
);

-- Where a person's data comes from. Tokens would be encrypted at rest in a
-- real deployment; the mock source stores none.
create table if not exists connected_accounts (
  id                bigserial primary key,
  person_id         text not null references persons(id),
  provider          text not null,              -- 'mock' | 'google_health' | ...
  access_token_enc  text,
  refresh_token_enc text,
  created_at        timestamptz not null default now(),
  unique (person_id, provider)
);

-- The durable, un-analyzed record. One canonical shape for every source.
create table if not exists raw_samples (
  id        bigserial primary key,
  person_id text not null references persons(id),
  metric    text not null,
  ts        timestamptz not null,
  value     double precision not null,
  unit      text not null,
  source    text not null default 'mock',
  unique (person_id, metric, ts, source)
);
create index if not exists idx_raw_samples_lookup on raw_samples (person_id, metric, ts);

-- Deterministic rollups: value plus its trailing baseline, z-score, and flag.
create table if not exists daily_summaries (
  person_id     text not null references persons(id),
  metric        text not null,
  day           date not null,
  value         double precision not null,
  baseline_mean double precision,
  baseline_sd   double precision,
  z             double precision,
  severity      double precision,               -- direction-aware |z| for flagging
  flag          text not null default 'normal', -- 'normal' | 'watch' | 'alert'
  trend         text not null default 'flat',   -- 'up' | 'down' | 'flat'
  primary key (person_id, metric, day)
);

-- WHOOP-style daily scores, derived from daily_summaries. Recovery is our own
-- composite (HRV + resting HR + sleep + skin temp vs personal baseline); strain
-- is a cardiovascular-load proxy; sleep_performance is achieved vs need.
create table if not exists daily_scores (
  person_id         text not null references persons(id),
  day               date not null,
  recovery          integer,                       -- 0..100, null before a baseline exists
  recovery_band     text,                          -- 'green' | 'yellow' | 'red'
  strain            double precision not null default 0,   -- 0..21
  sleep_performance integer not null default 0,     -- percent of need
  sleep_need        double precision,
  sleep_minutes     double precision,
  primary key (person_id, day)
);

-- Cached insight narratives. The dashboard reads these; page loads never call Claude.
create table if not exists insights (
  id           bigserial primary key,
  person_id    text not null references persons(id),
  period_end   date not null,
  generated_by text not null,                   -- 'claude' | 'rules'
  model        text,
  payload      jsonb not null,
  created_at   timestamptz not null default now(),
  unique (person_id, period_end, generated_by)
);
