import type { ThemeConfig } from "antd";
import { theme } from "antd";

/**
 * Design system « Nebula » — source de vérité unique des couleurs, rayons et typographies.
 *
 * Deux modes : clair (défaut) et sombre. Toutes les couleurs — neutres (fond, surfaces, bordures,
 * textes) ET accents (violet, vert, ambre, rouge…) — sont des variables CSS `--nb-*` redéfinies par
 * mode dans globals.css : utilisées dans les styles inline et les SVG, elles basculent sans re-rendu.
 * En clair, les accents sont plus foncés pour rester lisibles sur fond blanc.
 *  - transparence d'un accent : `alpha(palette.green, "22")` (jamais `${palette.green}22`) ;
 *  - graphiques G2 (canvas, sans variables CSS) : `accentHex(mode)` ;
 *  - Ant Design reçoit des valeurs concrètes par mode via `buildTheme()`.
 */
export type ThemeMode = "dark" | "light";

export const THEME_COOKIE = "crm-theme";

export const palette = {
  // Neutres — variables CSS (globals.css, :root / [data-theme="light"])
  bg: "var(--nb-bg)",
  surface: "var(--nb-surface)",
  border: "var(--nb-border)",
  text: "var(--nb-text)",
  textStrong: "var(--nb-text-strong)",
  textSecondary: "var(--nb-text-2)",
  textTertiary: "var(--nb-text-3)",
  // Accents — variables CSS, valeur par mode (ACCENTS ci-dessous, globals.css). Charte sobre : UNE couleur
  // d'accent (violet), des neutres, et les couleurs sémantiques (vert / ambre / rouge) quand elles portent un sens.
  // Les anciens noms (cyan, pink, indigo, blue) sont conservés comme alias pour ne rien casser.
  violet: "var(--nb-violet)",
  indigo: "var(--nb-violet)",
  cyan: "var(--nb-cyan)", // teinte claire de l'accent
  pink: "var(--nb-pink)", // neutre ardoise
  blue: "var(--nb-pink)", // neutre ardoise
  green: "var(--nb-green)",
  amber: "var(--nb-amber)",
  red: "var(--nb-red)",
  /** Dégradé de marque, monochrome (boutons primaires, avatars). */
  gradient: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
  gradientSoft: "linear-gradient(135deg, rgba(139,92,246,0.16), rgba(139,92,246,0.06))",
} as const;

/** Valeurs concrètes des accents par mode (miroir des variables CSS de globals.css). */
export const ACCENTS = {
  dark: { violet: "#8b5cf6", cyan: "#a78bfa", pink: "#94a3b8", green: "#34d399", amber: "#fbbf24", red: "#fb7185" },
  light: { violet: "#7c3aed", cyan: "#8b5cf6", pink: "#64748b", green: "#047857", amber: "#b45309", red: "#e11d48" },
} as const;

/** Accents en hexadécimal pour un mode (graphiques canvas, calculs de couleur). */
export function accentHex(mode: ThemeMode) {
  const a = ACCENTS[mode];
  return { ...a, indigo: a.violet, blue: a.pink };
}

/**
 * Couleur avec transparence. `a` = opacité en hexadécimal sur 2 chiffres (« 22 », « 80 »…), comme
 * l'ancien suffixe `${hex}22`. Fonctionne avec un hex (#rrggbb) comme avec une variable CSS.
 */
export function alpha(color: string, a: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return `${color}${a}`;
  const pct = Math.round((parseInt(a, 16) / 255) * 1000) / 10;
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}

/** Couleurs des statuts de lead (pipeline, graphiques, tags). */
export const statusColors: Record<string, string> = {
  NOUVEAU: palette.blue,
  CONTACTE: palette.cyan,
  QUALIFIE: palette.violet,
  EN_DISCUSSION: palette.amber,
  CONVERTI: palette.green,
  PERDU: palette.red,
};

/** Valeurs concrètes des neutres par mode (Ant Design ne sait pas dériver des variables CSS). */
const NEUTRALS = {
  dark: {
    bg: "#060913",
    surface: "rgba(15, 21, 38, 0.62)",
    elevated: "#141b31",
    solid: "#0f1526",
    border: "rgba(148, 163, 184, 0.14)",
    borderStrong: "rgba(148, 163, 184, 0.2)",
    text: "#e6eaf5",
    text2: "#94a0bd",
    text3: "#64708f",
    placeholder: "#7a86a6",
    shadow: "0 18px 48px -12px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(148, 163, 184, 0.12)",
    tableHeader: "rgba(148, 163, 184, 0.06)",
    tag: "rgba(148, 163, 184, 0.1)",
  },
  light: {
    bg: "#f3f5fb",
    surface: "rgba(255, 255, 255, 0.78)",
    elevated: "#ffffff",
    solid: "#ffffff",
    border: "rgba(15, 23, 42, 0.08)",
    borderStrong: "rgba(15, 23, 42, 0.14)",
    text: "#1e2538",
    text2: "#5b6478",
    text3: "#8c94a8",
    placeholder: "#9aa2b5",
    shadow: "0 18px 48px -18px rgba(30, 41, 80, 0.25), 0 0 0 1px rgba(15, 23, 42, 0.06)",
    tableHeader: "rgba(15, 23, 42, 0.03)",
    tag: "rgba(15, 23, 42, 0.05)",
  },
} as const;

export function buildTheme(mode: ThemeMode): ThemeConfig {
  const n = NEUTRALS[mode];
  const a = ACCENTS[mode];
  const dark = mode === "dark";
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: a.violet,
      colorInfo: a.violet,
      colorSuccess: dark ? a.green : "#059669",
      colorWarning: dark ? a.amber : "#d97706",
      colorError: a.red,
      colorLink: dark ? "#a78bfa" : "#7c3aed",
      colorBgBase: n.bg,
      colorBgLayout: "transparent",
      colorBgContainer: n.surface,
      colorBgElevated: n.elevated,
      colorBorder: n.borderStrong,
      colorBorderSecondary: n.border,
      colorText: n.text,
      colorTextSecondary: n.text2,
      colorTextTertiary: n.text3,
      colorTextPlaceholder: n.placeholder,
      borderRadius: 12,
      borderRadiusLG: 18,
      borderRadiusSM: 8,
      controlHeight: 38,
      fontSize: 14,
      fontFamily: "var(--font-inter), 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif",
      fontFamilyCode: "var(--font-mono), 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
      boxShadowSecondary: n.shadow,
      motionDurationMid: "0.25s",
    },
    components: {
      Layout: { bodyBg: "transparent", headerBg: "transparent", siderBg: "transparent" },
      Card: { colorBgContainer: n.surface, paddingLG: 22 },
      Menu: {
        darkItemBg: "transparent",
        darkSubMenuItemBg: "transparent",
        darkItemSelectedBg: "rgba(139, 92, 246, 0.18)",
        darkItemSelectedColor: "#ffffff",
        darkItemColor: n.text2,
        darkItemHoverBg: "rgba(148, 163, 184, 0.08)",
        darkGroupTitleColor: n.text3,
        itemBg: "transparent",
        itemColor: n.text2,
        itemHoverBg: "rgba(15, 23, 42, 0.04)",
        itemSelectedBg: "rgba(139, 92, 246, 0.12)",
        itemSelectedColor: "#6d28d9",
        groupTitleColor: n.text3,
        itemBorderRadius: 10,
        itemHeight: 42,
        itemMarginInline: 10,
      },
      Table: {
        headerBg: n.tableHeader,
        headerColor: n.text2,
        rowHoverBg: "rgba(139, 92, 246, 0.08)",
        borderColor: n.border,
        headerSplitColor: "transparent",
      },
      Button: { primaryShadow: "0 8px 24px -8px rgba(139, 92, 246, 0.65)", fontWeight: 600 },
      Modal: { contentBg: n.elevated, headerBg: n.elevated },
      Drawer: { colorBgElevated: n.solid },
      Tag: { defaultBg: n.tag },
      Segmented: {
        itemSelectedBg: dark ? "rgba(139, 92, 246, 0.35)" : "#ffffff",
        trackBg: dark ? "rgba(148, 163, 184, 0.08)" : "rgba(15, 23, 42, 0.05)",
      },
      Statistic: { contentFontSize: 28 },
      Input: { activeShadow: "0 0 0 3px rgba(139, 92, 246, 0.25)" },
      Select: { optionSelectedBg: "rgba(139, 92, 246, 0.16)" },
      Tooltip: dark ? { colorBgSpotlight: n.elevated } : {},
    },
  };
}
