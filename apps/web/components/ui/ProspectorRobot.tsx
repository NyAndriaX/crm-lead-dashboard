"use client";

/**
 * Robot de prospection — mascotte animée (SVG + CSS, sans dépendance).
 *
 *  - idle     : flotte, respire, cligne des yeux
 *  - scanning : faisceau de scan, yeux qui balaient, antenne et cœur qui pulsent, particules
 *  - success  : yeux « heureux », halo vert
 *  - error    : halo rouge, antenne clignotante
 */
export type RobotState = "idle" | "scanning" | "success" | "error";

const EYE: Record<RobotState, string> = {
  idle: "#a78bfa",
  scanning: "#a78bfa",
  success: "#34d399",
  error: "#fb7185",
};

export function ProspectorRobot({ state = "idle", size = 220 }: { state?: RobotState; size?: number }) {
  const eye = EYE[state];
  return (
    <div className={`rb rb-${state}`} style={{ width: size, height: size * 1.1 }} aria-hidden>
      <svg viewBox="0 0 220 242" width="100%" height="100%">
        <defs>
          <linearGradient id="rb-shell" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2a3358" />
            <stop offset="100%" stopColor="#141a31" />
          </linearGradient>
          <linearGradient id="rb-rim" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a78bfa" />
            <stop offset="55%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>
          <linearGradient id="rb-beam" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="rb-core">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="35%" stopColor={eye} />
            <stop offset="100%" stopColor={eye} stopOpacity="0" />
          </radialGradient>
          <filter id="rb-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Halo d'état */}
        <circle className="rb-halo" cx="110" cy="112" r="96" fill="none" stroke={eye} strokeOpacity="0.25" strokeWidth="1.5" />
        <circle className="rb-halo rb-halo-2" cx="110" cy="112" r="96" fill="none" stroke={eye} strokeOpacity="0.18" strokeWidth="1" />

        {/* Ombre au sol */}
        <ellipse className="rb-shadow" cx="110" cy="228" rx="46" ry="7" fill="#000" opacity="0.45" />

        <g className="rb-body">
          {/* Faisceau de scan */}
          <path className="rb-beam" d="M86 92 L20 238 L200 238 L134 92 Z" fill="url(#rb-beam)" />

          {/* Antenne */}
          <line x1="110" y1="22" x2="110" y2="44" stroke="url(#rb-rim)" strokeWidth="3" strokeLinecap="round" />
          <circle className="rb-antenna" cx="110" cy="18" r="6" fill={eye} filter="url(#rb-glow)" />

          {/* Tête */}
          <rect x="52" y="44" width="116" height="84" rx="30" fill="url(#rb-shell)" stroke="url(#rb-rim)" strokeWidth="2" />
          <rect x="64" y="58" width="92" height="52" rx="20" fill="#05070f" stroke="rgba(148,163,184,0.25)" />
          {/* Reflet visière */}
          <path d="M72 66 Q90 60 108 62" stroke="rgba(255,255,255,0.18)" strokeWidth="3" strokeLinecap="round" fill="none" />

          {/* Yeux */}
          <g className="rb-eyes" filter="url(#rb-glow)">
            <g className="rb-eye">
              <rect className="rb-eye-shape" x="82" y="76" width="18" height="16" rx="8" fill={eye} />
            </g>
            <g className="rb-eye">
              <rect className="rb-eye-shape" x="120" y="76" width="18" height="16" rx="8" fill={eye} />
            </g>
          </g>
          {/* Yeux « heureux » (succès) */}
          <g className="rb-happy" stroke={eye} strokeWidth="4" strokeLinecap="round" fill="none" filter="url(#rb-glow)">
            <path d="M83 88 Q91 78 99 88" />
            <path d="M121 88 Q129 78 137 88" />
          </g>

          {/* Oreilles */}
          <rect x="40" y="72" width="12" height="28" rx="6" fill="#1b2240" stroke="url(#rb-rim)" strokeWidth="1.5" />
          <rect x="168" y="72" width="12" height="28" rx="6" fill="#1b2240" stroke="url(#rb-rim)" strokeWidth="1.5" />

          {/* Cou + corps */}
          <rect x="98" y="128" width="24" height="10" rx="4" fill="#1b2240" />
          <rect x="66" y="136" width="88" height="66" rx="24" fill="url(#rb-shell)" stroke="url(#rb-rim)" strokeWidth="2" />

          {/* Cœur énergétique */}
          <circle className="rb-core" cx="110" cy="168" r="16" fill="url(#rb-core)" />
          <circle className="rb-ring" cx="110" cy="168" r="21" fill="none" stroke={eye} strokeWidth="2" strokeDasharray="10 8" />

          {/* Bras */}
          <g className="rb-arm-l">
            <rect x="44" y="144" width="18" height="44" rx="9" fill="#1b2240" stroke="url(#rb-rim)" strokeWidth="1.5" />
          </g>
          <g className="rb-arm-r">
            <rect x="158" y="144" width="18" height="44" rx="9" fill="#1b2240" stroke="url(#rb-rim)" strokeWidth="1.5" />
          </g>

          {/* Propulseur */}
          <path className="rb-thrust" d="M98 204 L110 224 L122 204 Z" fill={eye} opacity="0.7" filter="url(#rb-glow)" />
        </g>

        {/* Particules de données (scan) */}
        <g className="rb-particles" fill={eye}>
          <circle cx="30" cy="80" r="2.5" />
          <circle cx="192" cy="60" r="2" />
          <circle cx="200" cy="150" r="2.5" />
          <circle cx="22" cy="170" r="2" />
          <circle cx="60" cy="30" r="1.5" />
          <circle cx="170" cy="24" r="1.5" />
        </g>
      </svg>
    </div>
  );
}
