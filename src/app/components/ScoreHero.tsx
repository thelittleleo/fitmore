import type { ScoreDay } from "@/lib/types";
import { Ring } from "./Ring";

const bandColor = {
  green: "var(--good)",
  yellow: "var(--warn)",
  red: "var(--bad)",
} as const;

// Descriptive, not prescriptive — safe for a cardiac patient. No "go crush it".
function recoveryWord(band: ScoreDay["band"]): string {
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

export function ScoreHero({ s }: { s: ScoreDay }) {
  const recovery = s.recovery ?? 0;
  const color = s.band ? bandColor[s.band] : "var(--ink-faint)";
  const sleepHours = s.sleepMinutes != null ? (s.sleepMinutes / 60).toFixed(1) : "—";

  return (
    <div className="hero">
      <div className="hero-metric">
        <Ring value={recovery} max={100} display={String(recovery)} unit="%" caption="Recovery" color={color} />
        <div className="hero-title" style={{ color }}>
          {recoveryWord(s.band)}
        </div>
        <div className="hero-sub">HRV · resting HR · sleep · temp vs your baseline</div>
      </div>

      <div className="hero-metric">
        <Ring value={s.strain} max={21} display={s.strain.toFixed(1)} caption="Day strain" color="var(--strain)" />
        <div className="hero-title" style={{ color: "var(--strain)" }}>
          {strainWord(s.strain)}
        </div>
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
        <div className="hero-sub">Achieved vs your need</div>
      </div>
    </div>
  );
}
