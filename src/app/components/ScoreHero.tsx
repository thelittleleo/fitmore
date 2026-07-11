import type { ScoreDay, ScoresView, RecoveryBand } from "@/lib/types";
import { Ring } from "./Ring";

const bandFill = { green: "var(--good)", yellow: "var(--warn)", red: "var(--bad)" } as const;
const bandInk = { green: "var(--good-ink)", yellow: "var(--warn-ink)", red: "var(--bad-ink)" } as const;

// Descriptive, not prescriptive — safe for a cardiac patient. No "go crush it".
function recoveryWord(band: RecoveryBand | null): string {
  if (band === "green") return "Well recovered";
  if (band === "yellow") return "Moderately recovered";
  if (band === "red") return "Under-recovered";
  return "—";
}
function strainWord(strain: number): string {
  if (strain >= 18) return "All-out";
  if (strain >= 14) return "High";
  if (strain >= 10) return "Moderate";
  return "Light";
}
function driverBand(v: number): RecoveryBand {
  return v >= 67 ? "green" : v >= 34 ? "yellow" : "red";
}

function weekDelta(history: ScoreDay[], pick: (d: ScoreDay) => number): number | null {
  if (history.length < 2) return null;
  const latest = pick(history[history.length - 1]);
  const prior = history.slice(-8, -1); // up to 7 days before the latest
  if (prior.length === 0) return null;
  const avg = prior.reduce((a, d) => a + pick(d), 0) / prior.length;
  return latest - avg;
}

function DeltaTag({ value, mode }: { value: number | null; mode: "goodUp" | "neutral" }) {
  if (value === null || Math.abs(value) < 1) {
    return <span className="delta flat">— steady vs last wk</span>;
  }
  const up = value > 0;
  const cls = mode === "neutral" ? "neutral" : up ? "up-good" : "down-bad";
  return (
    <span className={`delta ${cls}`}>
      {up ? "▲" : "▼"} {Math.abs(Math.round(value))} vs last wk
    </span>
  );
}

function DriverBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="driver">
      <span className="driver-label">{label}</span>
      <span className="driver-track">
        <span className="driver-fill" style={{ width: `${value}%`, background: bandFill[driverBand(value)] }} />
      </span>
    </div>
  );
}

export function ScoreHero({ scores }: { scores: ScoresView }) {
  const s = scores.latest;
  if (!s) return null;
  const recovery = s.recovery ?? 0;
  const fill = s.band ? bandFill[s.band] : "var(--ink-faint)";
  const ink = s.band ? bandInk[s.band] : "var(--ink-faint)";
  const sleepHours = s.sleepMinutes != null ? (s.sleepMinutes / 60).toFixed(1) : "—";

  const dRecovery = weekDelta(scores.history, (d) => d.recovery ?? 0);
  const dStrain = weekDelta(scores.history, (d) => d.strain);
  const dSleep = weekDelta(scores.history, (d) => d.sleepPerformance);

  return (
    <div className="hero">
      <div className="hero-metric">
        <Ring value={recovery} max={100} display={String(recovery)} unit="%" caption="Recovery" color={fill} />
        <div className="hero-title" style={{ color: ink }}>
          {recoveryWord(s.band)}
        </div>
        <DeltaTag value={dRecovery} mode="goodUp" />
        {scores.drivers && (
          <div className="drivers">
            <DriverBar label="HRV" value={scores.drivers.hrv} />
            <DriverBar label="Resting HR" value={scores.drivers.rhr} />
            <DriverBar label="Sleep" value={scores.drivers.sleep} />
          </div>
        )}
      </div>

      <div className="hero-metric">
        <Ring value={s.strain} max={21} display={s.strain.toFixed(1)} caption="Day strain" color="var(--strain)" />
        <div className="hero-title" style={{ color: "var(--strain)" }}>
          {strainWord(s.strain)}
        </div>
        <DeltaTag value={dStrain} mode="neutral" />
        <div className="hero-sub">Cardiovascular load, 0–21</div>
      </div>

      <div className="hero-metric">
        <Ring
          value={s.sleepPerformance}
          max={100}
          display={String(s.sleepPerformance)}
          unit="%"
          caption="Sleep"
          color="var(--sleep)"
        />
        <div className="hero-title" style={{ color: "var(--sleep)" }}>
          {sleepHours} h of sleep
        </div>
        <DeltaTag value={dSleep} mode="goodUp" />
        <div className="hero-sub">Achieved vs your need</div>
      </div>
    </div>
  );
}
