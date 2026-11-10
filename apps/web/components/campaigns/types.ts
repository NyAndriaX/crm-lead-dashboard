export type TemplateOpt = { id: string; name: string; subject: string; category?: string | null; bodyHtml?: string };
export type SmtpOpt = { id: string; label: string; fromEmail?: string | null; fromName?: string | null; dailyLimit?: number; isActive?: boolean };

/** Filtres d'un segment — même forme que `segmentFiltersSchema` côté API. */
export type SegmentFilters = {
  status?: string;
  sector?: string;
  city?: string;
  country?: string;
  source?: string;
  tag?: string;
  scoreMin?: number;
  scoreMax?: number;
  createdAfter?: string;
  q?: string;
};

export type SegmentRow = {
  id: string;
  name: string;
  filters: SegmentFilters | null;
  createdAt: string;
  leadCount?: number;
  reachable?: number;
  campaigns?: number;
};

export type CampaignConfig = {
  throttleMinDelayMs?: number;
  bodyHtmlOverride?: string | null;
  aiPersonalize?: boolean;
  ab?: { enabled?: boolean; subjectB?: string | null; bodyHtmlB?: string | null; splitPercent?: number };
  warmup?: { enabled?: boolean; startPerDay?: number; growth?: number };
};

export type CampaignRow = {
  id: string;
  name: string;
  status: string;
  subject: string | null;
  scheduledAt: string | null;
  dailyLimit: number | null;
  stats: unknown;
  config: CampaignConfig | null;
  createdAt?: string;
  updatedAt?: string;
  template: TemplateOpt | null;
  segment: { id: string; name: string; filters?: SegmentFilters | null } | null;
  smtpConfig: (SmtpOpt & { sentToday?: number }) | null;
};

export type PreviewLead = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string | null;
  sector: string | null;
  city: string | null;
  status: string;
  score: number;
};

export type SegmentPreview = {
  total: number;
  reachable: number;
  noEmail: number;
  blacklisted: number;
  byStatus: Record<string, number>;
  sample: PreviewLead[];
};

export type Facet = { value: string; count: number };
export type LeadFacets = { sectors: Facet[]; cities: Facet[]; sources: Facet[]; countries: Facet[]; tags: Facet[] };

/** Retire les clés vides pour n'envoyer à l'API que les critères actifs. */
export function cleanFilters(f: SegmentFilters): SegmentFilters {
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== null && v !== "")) as SegmentFilters;
}

/** Remplace les variables de fusion comme le fait l'envoi (packages/jobs/src/mergeVars.ts). */
export function personalizePreview(html: string, lead: Pick<PreviewLead, "firstName" | "lastName" | "company" | "email"> | null): string {
  const l = lead ?? { firstName: "Camille", lastName: "Martin", company: "Exemple SAS", email: "camille@exemple.fr" };
  return html
    .replace(/\{\{\s*(prenom|firstName|first_name)\s*\}\}/gi, l.firstName ?? "")
    .replace(/\{\{\s*(nom|lastName|last_name)\s*\}\}/gi, l.lastName ?? "")
    .replace(/\{\{\s*(entreprise|company)\s*\}\}/gi, l.company ?? "")
    .replace(/\{\{\s*email\s*\}\}/gi, l.email ?? "")
    .replace(/\{\{\s*(actu|custom)\s*\}\}/gi, "");
}
