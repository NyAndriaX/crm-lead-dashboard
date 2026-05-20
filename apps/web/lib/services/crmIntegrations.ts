/**
 * Intégrations CRM tiers — INT-02.
 *
 * Export des leads dans le format d'import natif de HubSpot, Pipedrive ou
 * Salesforce (mapping des en-têtes de colonnes). Symétriquement, le mapping
 * inverse permet à /api/import de reconnaître un export issu de ces CRM
 * (auto-détection des colonnes — réutilise suggest-mapping).
 *
 * Phase 1 : CSV/XLSX (implémenté). Phase 2 : API directe (OAuth) — hors
 * périmètre, documenté dans docs/integrations/crm.md.
 */

export type CrmTarget = "hubspot" | "pipedrive" | "salesforce";

/** Champ interne → en-tête attendu par le CRM cible. */
const FIELD_MAP: Record<CrmTarget, Record<string, string>> = {
  hubspot: {
    firstName: "First Name",
    lastName: "Last Name",
    email: "Email",
    phone: "Phone Number",
    company: "Company Name",
    website: "Website URL",
    sector: "Industry",
    city: "City",
    country: "Country/Region",
    source: "Original Source",
    status: "Lead Status",
    score: "HubSpot Score",
  },
  pipedrive: {
    firstName: "Person - First name",
    lastName: "Person - Last name",
    email: "Person - Email",
    phone: "Person - Phone",
    company: "Organization - Name",
    website: "Organization - Website",
    sector: "Organization - Industry",
    city: "Person - City",
    country: "Person - Country",
    source: "Lead - Source",
    status: "Lead - Status",
    score: "Lead - Score",
  },
  salesforce: {
    firstName: "FirstName",
    lastName: "LastName",
    email: "Email",
    phone: "Phone",
    company: "Company",
    website: "Website",
    sector: "Industry",
    city: "City",
    country: "Country",
    source: "LeadSource",
    status: "Status",
    score: "Lead_Score__c",
  },
};

export const CRM_TARGETS: CrmTarget[] = ["hubspot", "pipedrive", "salesforce"];

export const CRM_LABELS: Record<CrmTarget, string> = {
  hubspot: "HubSpot",
  pipedrive: "Pipedrive",
  salesforce: "Salesforce",
};

/** Réécrit une ligne (clés internes) vers les en-têtes du CRM cible. */
export function mapRowToCrm(
  row: Record<string, unknown>,
  target: CrmTarget,
): Record<string, unknown> {
  const map = FIELD_MAP[target];
  const out: Record<string, unknown> = {};
  for (const [internal, header] of Object.entries(map)) {
    out[header] = row[internal] ?? "";
  }
  return out;
}

export function crmHeaders(target: CrmTarget): string[] {
  return Object.values(FIELD_MAP[target]);
}

/**
 * Mapping inverse (en-tête CRM tiers normalisé → champ interne), pour
 * l'auto-détection à l'import. Clé = header en minuscules sans espaces.
 */
export function reverseHeaderHints(): Record<string, string> {
  const hints: Record<string, string> = {};
  for (const target of CRM_TARGETS) {
    for (const [internal, header] of Object.entries(FIELD_MAP[target])) {
      hints[header.toLowerCase().replace(/[^a-z0-9]/g, "")] = internal;
    }
  }
  return hints;
}
