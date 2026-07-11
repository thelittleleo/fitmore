import type { DataSource } from "./source";
import type { HealthSample } from "@/lib/types";
import { METRIC_BY_KEY, type MetricKey } from "@/lib/metrics";

// A synthetic stand-in for the Fitbit Air, shaped exactly like what the real
// Google Health API adapter will emit. This is what lets us build and demo the
// entire pipeline before the hardware exists — on the day the Air arrives, we
// register a real adapter and delete nothing else.

// Deterministic RNG so the demo data is stable across runs.
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Box–Muller: a normal(0,1) sample from two uniforms.
function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-9);
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

interface Profile {
  seed: number;
  base: Record<MetricKey, number>;
  noise: Record<MetricKey, number>;
  // Optional per-metric "story" injected into recent days to make the
  // deterministic engine surface a realistic flag on the dashboard.
  story?: (metric: MetricKey, dayIndex: number, total: number) => number;
}

const PROFILES: Record<string, Profile> = {
  // Healthy adult, mostly steady.
  you: {
    seed: 1042,
    base: {
      resting_hr: 57, hrv: 66, spo2: 97.2, skin_temp_delta: 0,
      sleep_minutes: 445, sleep_deep_minutes: 92, steps: 9200, active_zone_minutes: 34,
    },
    noise: {
      resting_hr: 1.6, hrv: 4.5, spo2: 0.5, skin_temp_delta: 0.18,
      sleep_minutes: 28, sleep_deep_minutes: 10, steps: 1800, active_zone_minutes: 9,
    },
    story: (metric, dayIndex, total) => {
      // One recent poor-sleep night, so "you" isn't uniformly green.
      if (metric === "sleep_minutes" && dayIndex === total - 3) return -95;
      if (metric === "sleep_deep_minutes" && dayIndex === total - 3) return -22;
      return 0;
    },
  },
  // Post-bypass patient: higher RHR, lower HRV, plus two injected concerns in
  // the last week (a resting-HR creep and a recent overnight SpO2 dip).
  mum: {
    seed: 7,
    base: {
      resting_hr: 70, hrv: 34, spo2: 95.4, skin_temp_delta: 0,
      sleep_minutes: 402, sleep_deep_minutes: 58, steps: 4100, active_zone_minutes: 14,
    },
    noise: {
      resting_hr: 1.4, hrv: 3.2, spo2: 0.55, skin_temp_delta: 0.2,
      sleep_minutes: 30, sleep_deep_minutes: 9, steps: 1200, active_zone_minutes: 6,
    },
    story: (metric, dayIndex, total) => {
      const fromEnd = total - 1 - dayIndex;
      // Resting HR creeps up over the last 9 days → an "alert" by today.
      if (metric === "resting_hr" && fromEnd <= 9) return (9 - fromEnd) * 0.55;
      // A pronounced overnight SpO2 dip on the most recent night.
      if (metric === "spo2" && fromEnd === 0) return -3.6;
      if (metric === "spo2" && fromEnd === 4) return -2.4;
      return 0;
    },
  },
};

export function createMockSource(): DataSource {
  return {
    name: "mock",
    async fetchSamples({ personId, days, until }) {
      const profile = PROFILES[personId];
      if (!profile) return [];
      const rng = mulberry32(profile.seed);
      const samples: HealthSample[] = [];

      for (let i = 0; i < days; i++) {
        const dayIndex = i; // 0 = oldest, days-1 = most recent
        const ts = new Date(until);
        ts.setUTCHours(6, 0, 0, 0);
        ts.setUTCDate(ts.getUTCDate() - (days - 1 - i));

        for (const key of Object.keys(profile.base) as MetricKey[]) {
          const def = METRIC_BY_KEY[key];
          const story = profile.story?.(key, dayIndex, days) ?? 0;
          let value = profile.base[key] + gaussian(rng) * profile.noise[key] + story;

          // Keep values physically sane.
          if (key === "spo2") value = Math.min(100, Math.max(88, value));
          if (key === "resting_hr" || key === "hrv") value = Math.max(20, value);
          if (key === "steps" || key === "active_zone_minutes" || key.startsWith("sleep")) {
            value = Math.max(0, value);
          }

          samples.push({
            personId,
            metric: key,
            ts,
            value: Number(value.toFixed(def.decimals + 1)),
            unit: def.unit,
          });
        }
      }
      return samples;
    },
  };
}
