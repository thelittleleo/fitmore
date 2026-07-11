// A circular gauge — the WHOOP look. Pure SVG, no JS, so it server-renders.
export function Ring({
  value,
  max,
  display,
  unit,
  caption,
  color,
}: {
  value: number;
  max: number;
  display: string;
  unit?: string;
  caption: string;
  color: string;
}) {
  const R = 54;
  const SW = 12;
  const C = 2 * Math.PI * R;
  const frac = Math.max(0, Math.min(1, value / max));
  const offset = C * (1 - frac);

  return (
    <div className="ring">
      <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label={`${caption} ${display}`}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--surface-2)" strokeWidth={SW} />
        <circle
          className="ring-arc"
          cx="70"
          cy="70"
          r={R}
          fill="none"
          stroke={color}
          strokeWidth={SW}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          transform="rotate(-90 70 70)"
        />
      </svg>
      <div className="ring-center">
        <div className="ring-value" style={{ color }}>
          {display}
          {unit && <span className="ring-unit">{unit}</span>}
        </div>
        <div className="ring-cap">{caption}</div>
      </div>
    </div>
  );
}
