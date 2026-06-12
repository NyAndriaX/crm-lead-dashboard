/**
 * Constantes et types d'identité visuelle — safe côté client (pas de @crm/db).
 */

export type OrgBranding = {
  siteName?: string;
  siteIconUrl?: string | null;
  /** Taille affichée dans la barre latérale (px). */
  siteIconSizeSidebar?: number;
  /** Taille affichée sur la page de connexion (px). */
  siteIconSizeLogin?: number;
};

export const DEFAULT_ICON_SIZE_SIDEBAR = 28;
export const DEFAULT_ICON_SIZE_LOGIN = 44;
export const DEFAULT_SITE_NAME = "CRM Lead Dashboard";

export function parseBrandingSizes(settings: unknown): Pick<
  OrgBranding,
  "siteName" | "siteIconUrl" | "siteIconSizeSidebar" | "siteIconSizeLogin"
> {
  if (!settings || typeof settings !== "object") return {};
  const s = settings as Record<string, unknown>;
  const branding = (s.branding ?? {}) as Record<string, unknown>;
  const num = (v: unknown, min: number, max: number, fallback: number) => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
  };
  return {
    siteName: typeof branding.siteName === "string" ? branding.siteName : undefined,
    siteIconUrl: typeof branding.siteIconUrl === "string" ? branding.siteIconUrl : undefined,
    siteIconSizeSidebar: num(branding.siteIconSizeSidebar, 16, 64, DEFAULT_ICON_SIZE_SIDEBAR),
    siteIconSizeLogin: num(branding.siteIconSizeLogin, 24, 80, DEFAULT_ICON_SIZE_LOGIN),
  };
}
