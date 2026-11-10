"use client";

/**
 * Radar de prospection : balayage continu, et un « blip » par établissement trouvé
 * (position pseudo-aléatoire stable dérivée de l'identifiant, couleur selon le score IA).
 */
export type RadarBlip = { id: string; score?: number | null };

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function blipColor(score?: number | null): string {
  if (score == null) return "#a78bfa";
  if (score >= 70) return "#34d399";
  if (score >= 45) return "#fbbf24";
  return "#fb7185";
}

export function RadarScanner({ blips = [], active = true, size = 260 }: { blips?: RadarBlip[]; active?: boolean; size?: number }) {
  return (
    <div style={{ position: "relative", width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 200 200" width="100%" height="100%">
        <defs>
          <radialGradient id="rd-bg">
            <stop offset="0%" stopColor="rgba(167, 139, 250,0.14)" />
            <stop offset="100%" stopColor="rgba(167, 139, 250,0)" />
          </radialGradient>
          <linearGradient id="rd-sweep" gradientTransform="rotate(90)">
            <stop offset="0%" stopColor="rgba(167, 139, 250,0)" />
            <stop offset="100%" stopColor="rgba(167, 139, 250,0.55)" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r="96" fill="url(#rd-bg)" stroke="rgba(167, 139, 250,0.35)" />
        {[72, 48, 24].map((r) => (
          <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="rgba(167, 139, 250,0.18)" strokeDasharray="2 4" />
        ))}
        <line x1="4" y1="100" x2="196" y2="100" stroke="rgba(167, 139, 250,0.12)" />
        <line x1="100" y1="4" x2="100" y2="196" stroke="rgba(167, 139, 250,0.12)" />
        {active && (
          <g style={{ transformOrigin: "100px 100px", animation: "nb-spin 3.2s linear infinite" }}>
            <path d="M100 100 L100 4 A96 96 0 0 1 183 52 Z" fill="url(#rd-sweep)" opacity="0.8" />
            <line x1="100" y1="100" x2="100" y2="4" stroke="#a78bfa" strokeWidth="1.5" style={{ filter: "drop-shadow(0 0 4px #a78bfa)" }} />
          </g>
        )}
        {blips.slice(0, 80).map((b, i) => {
          const h = hash(b.id);
          const angle = ((h % 360) * Math.PI) / 180;
          const radius = 18 + ((h >> 9) % 74);
          const x = 100 + Math.cos(angle) * radius;
          const y = 100 + Math.sin(angle) * radius;
          const c = blipColor(b.score);
          return (
            <g key={b.id} style={{ animation: `nb-pop-in 0.6s var(--nb-ease) ${Math.min(i, 20) * 0.05}s both` }}>
              <circle cx={x} cy={y} r="6" fill={c} opacity="0.18" />
              <circle cx={x} cy={y} r="2.6" fill={c} style={{ filter: `drop-shadow(0 0 3px ${c})` }} />
            </g>
          );
        })}
        <circle cx="100" cy="100" r="4" fill="#a78bfa" style={{ filter: "drop-shadow(0 0 6px #a78bfa)" }} />
      </svg>
    </div>
  );
}
