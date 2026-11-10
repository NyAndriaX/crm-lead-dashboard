/**
 * Catalogue des fournisseurs d'enrichissement (INT-03) — sans dépendance Node : partagé par
 * l'API (résolution des clés) et Configuration › Enrichissement (navigateur).
 *
 * Ordre d'appel dans l'engine (lib/services/enrichment.ts) :
 *  - email      : Hunter.io → Dropcontact → motifs + MX (gratuit)
 *  - entreprise : Pappers → API Recherche d'entreprises (gratuite, sans clé) → bloc vide
 */
export type EnrichmentProviderId = "hunter" | "dropcontact" | "pappers" | "recherche-entreprises";

export type EnrichmentProviderDef = {
  id: EnrichmentProviderId;
  label: string;
  vendor: string;
  usedFor: "email" | "company";
  description: string;
  /** Variable d'environnement de repli (null : fournisseur sans clé). */
  envVar: string | null;
  needsKey: boolean;
  docsUrl: string;
};

export const ENRICHMENT_PROVIDERS: EnrichmentProviderDef[] = [
  {
    id: "hunter",
    label: "Hunter.io",
    vendor: "Hunter",
    usedFor: "email",
    description: "Recherche de l'email professionnel à partir du prénom, du nom et du domaine (Email Finder).",
    envVar: "HUNTER_API_KEY",
    needsKey: true,
    docsUrl: "https://hunter.io/api-documentation",
  },
  {
    id: "dropcontact",
    label: "Dropcontact",
    vendor: "Dropcontact (France, RGPD)",
    usedFor: "email",
    description: "Email nominatif vérifié à partir du nom et de l'entreprise ; essayé après Hunter.io. Traitement asynchrone (quelques secondes).",
    envVar: "DROPCONTACT_API_KEY",
    needsKey: true,
    docsUrl: "https://developer.dropcontact.com",
  },
  {
    id: "pappers",
    label: "Pappers",
    vendor: "Pappers",
    usedFor: "company",
    description: "Données légales des entreprises françaises : raison sociale, SIREN, code NAF, date de création.",
    envVar: "PAPPERS_API_KEY",
    needsKey: true,
    docsUrl: "https://www.pappers.fr/api/documentation",
  },
  {
    id: "recherche-entreprises",
    label: "Recherche d'entreprises",
    vendor: "API publique de l'État (data.gouv.fr)",
    usedFor: "company",
    description: "Registre officiel (SIRENE) gratuit et sans clé : SIREN, NAF, tranche d'effectif, date de création, siège. Utilisé si Pappers n'est pas configuré ou ne trouve rien.",
    envVar: null,
    needsKey: false,
    docsUrl: "https://recherche-entreprises.api.gouv.fr/docs/",
  },
];

export function getEnrichmentProvider(id: string): EnrichmentProviderDef | undefined {
  return ENRICHMENT_PROVIDERS.find((p) => p.id === id);
}
