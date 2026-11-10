import type { ThemeConfig } from "antd";
import { theme } from "antd";

/**
 * Design system « Nebula » — source de vérité unique des couleurs, rayons et typographies.
 *
 * Deux modes : sombre (défaut) et clair. Les couleurs NEUTRES (fond, surfaces, bordures,
 * textes) sont des variables CSS `--nb-*` redéfinies par mode dans globals.css : utilisées
 * dans les styles inline, elles basculent sans re-rendu. Les couleurs d'ACCENT restent des
 * hex identiques dans les deux modes (elles servent aussi aux SVG et aux transparences
 * `${hex}33`). Ant Design reçoit des valeurs concrètes par mode via `buildTheme()`.
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
  // Accents — identiques dans les deux modes. Charte sobre : UNE couleur d'accent (violet),
  // des neutres, et les couleurs sémantiques (vert / ambre / rouge) seulement quand elles portent un sens.
  // Les anciens noms (cyan, pink, indigo, blue) sont conservés comme alias pour ne rien casser.
  violet: "#8b5cf6",
  indigo: "#8b5cf6",
  cyan: "#a78bfa", // teinte claire de l'accent
  pink: "#94a3b8", // neutre ardoise
  blue: "#94a3b8", // neutre ardoise
  green: "#34d399",
  amber: "#fbbf24",
  red: "#fb7185",
  /** Dégradé de marque, monochrome (boutons primaires, avatars). */
  gradient: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
  gradientSoft: "linear-gradient(135deg, rgba(139,92,246,0.16), rgba(139,92,246,0.06))",
} as const;

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
  const dark = mode === "dark";
  return {
    algorithm: dark ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: palette.violet,
      colorInfo: dark ? palette.violet : "#7c3aed",
      colorSuccess: dark ? palette.green : "#10b981",
      colorWarning: dark ? palette.amber : "#f59e0b",
      colorError: dark ? palette.red : "#f43f5e",
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
