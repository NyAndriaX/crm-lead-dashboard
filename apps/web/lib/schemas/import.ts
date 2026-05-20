// Schémas Zod — module Import (CRM-021 → CRM-027)
import { z } from "zod";

/** Champs lead acceptés lors d'un import. */
export const IMPORTABLE_FIELDS = [
  "email", "phone", "firstName", "lastName", "company",
  "website", "sector", "city", "country", "source", "notes",
] as const;
export type ImportableField = (typeof IMPORTABLE_FIELDS)[number];

/** Labels affichés dans l'UI de mapping. */
export const IMPORTABLE_FIELD_LABELS: Record<ImportableField, string> = {
  email: "Email",
  phone: "Téléphone",
  firstName: "Prénom",
  lastName: "Nom",
  company: "Entreprise",
  website: "Site web",
  sector: "Secteur",
  city: "Ville",
  country: "Pays",
  source: "Source",
  notes: "Notes",
};

/**
 * Mapping colonnes → champs lead.
 * Clé = nom du champ lead (ImportableField), valeur = en-tête CSV/XLSX.
 */
export const columnMappingSchema = z.record(z.enum(IMPORTABLE_FIELDS), z.string().min(1));
export type ColumnMapping = z.infer<typeof columnMappingSchema>;

/** Corps de POST /api/import/:id/start — confirme le mapping et lance le traitement. */
export const startImportSchema = z.object({
  mapping: columnMappingSchema,
  skipDuplicates: z.boolean().default(true),
  defaultSource: z.string().trim().max(255).optional(),
  defaultTags: z.array(z.string().trim().min(1).max(64)).max(20).optional(),
});
export type StartImportInput = z.infer<typeof startImportSchema>;

/** Schéma de scoring weights pour l'UI admin (CRM-019). */
export const scoringWeightsSchema = z.object({
  hasEmail: z.number().int().min(0).max(100),
  hasPhone: z.number().int().min(0).max(100),
  hasCompany: z.number().int().min(0).max(100),
  hasWebsite: z.number().int().min(0).max(100),
  hasSector: z.number().int().min(0).max(100),
  hasLocation: z.number().int().min(0).max(100),
  enriched: z.number().int().min(0).max(100),
  perOpen: z.number().int().min(0).max(100),
  maxOpens: z.number().int().min(0).max(100),
  perClick: z.number().int().min(0).max(100),
  maxClicks: z.number().int().min(0).max(100),
  replied: z.number().int().min(0).max(100),
  statusBonus: z.object({
    CONTACTE: z.number().int().min(-50).max(50),
    QUALIFIE: z.number().int().min(-50).max(50),
    EN_DISCUSSION: z.number().int().min(-50).max(50),
    CONVERTI: z.number().int().min(-50).max(50),
    PERDU: z.number().int().min(-50).max(50),
  }),
});
export type ScoringWeightsInput = z.infer<typeof scoringWeightsSchema>;
