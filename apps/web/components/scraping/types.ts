/** Types côté client de la page Prospection IA (miroir des DTO de lib/services/scraping.ts). */
import { palette } from "@/lib/theme";

export type SchedulePlan = {
  mode: "manual" | "once" | "recurring";
  runAt?: string | null;
  frequency?: "daily" | "weekly" | "monthly" | null;
};

export type Mission = {
  id: string;
  name: string;
  config: {
    keywords: string;
    brief?: string | null;
    queries?: string[];
    targetProfile?: string | null;
    minFitScore?: number | null;
    location: { city?: string | null; country?: string | null; radiusKm?: number | null };
    limit: number;
    detailed: boolean;
    locale: string;
    filter_country: boolean;
    requireEmail: boolean;
    dailyQuota?: number | null;
    autoPipeline?: { enabled: boolean; sequenceId?: string | null };
    schedulePlan?: SchedulePlan;
    /** Pages de sites sectoriels (annuaires de branche, listes de membres). */
    sectorSites?: string[];
    /** Débit : délai, tentatives, rotation d'user-agent, proxy (masqué s'il contient des identifiants). */
    rate?: { delayMs: number; retries: number; rotateUserAgent: boolean; proxyUrl?: string | null };
  };
  schedule: string | null;
  scheduleLabel: string;
  status: string;
  logs: string | null;
  createdAt: string;
  updatedAt?: string;
  bufferCounts: { pending: number; accepted: number; rejected: number };
};

export type LeadAI = {
  summary: string;
  activity?: string | null;
  services?: string[];
  signals?: string[];
  fit_score: number;
  fit_reason?: string | null;
  decision_maker_role?: string | null;
};

export type BufferItem = {
  id: string;
  status: "pending" | "accepted" | "rejected" | string;
  raw: {
    company?: string | null;
    name?: string | null;
    contact_role?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    address?: string | null;
    city?: string | null;
    sector?: string | null;
    rating?: number | null;
    reviews?: number | null;
    email_status?: string | null;
    maps_url?: string | null;
    source?: string | null;
    source_url?: string | null;
    enrichment?: string | null;
    ai?: (LeadAI & { decision_maker_email?: string | null; decision_maker_phone?: string | null; best_phone?: string | null }) | null;
    contacts?: {
      phones?: { number: string; display: string; kind: string }[];
      socials?: Record<string, string>;
      contact_url?: string | null;
      legal?: { siren?: string; legal_form?: string } | null;
    } | null;
    duplicate?: boolean;
    duplicateReason?: string | null;
    rejectReason?: string | null;
    injectedLeadId?: string;
  };
  createdAt: string;
};

export type ScrapingStatus = { live: boolean; scraper: { ok: boolean; error: string | null } | null; ai: boolean };

export type ScrapingPlan = {
  name: string;
  queries: string[];
  targetProfile: string;
  exclusions: string[];
  suggestedLimit: number;
  minFitScore: number;
  rationale: string;
};

export const MISSION_STATUS: Record<string, { color: string; label: string }> = {
  pending: { color: palette.textTertiary, label: "Prête" },
  scheduled: { color: palette.violet, label: "Planifiée" },
  queued: { color: palette.blue, label: "En file" },
  running: { color: palette.cyan, label: "En mission" },
  done: { color: palette.green, label: "Terminée" },
  error: { color: palette.red, label: "Erreur" },
};

export const EMAIL_STATUS: Record<string, { color: string; label: string }> = {
  found: { color: "green", label: "Email site" },
  found_legal: { color: "cyan", label: "Email légal" },
  no_email: { color: "default", label: "Sans email" },
  no_website: { color: "orange", label: "Sans site" },
  unreachable: { color: "red", label: "Site injoignable" },
  robots_disallowed: { color: "volcano", label: "Interdit (robots.txt)" },
};

export function fitColor(score: number | null | undefined): string {
  if (score == null) return palette.textTertiary;
  if (score >= 70) return palette.green;
  if (score >= 45) return palette.amber;
  return palette.red;
}

export function isActive(m: Pick<Mission, "status">): boolean {
  return m.status === "running" || m.status === "queued";
}

export function apiError(e: unknown, fallback: string): string {
  return (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? fallback;
}
