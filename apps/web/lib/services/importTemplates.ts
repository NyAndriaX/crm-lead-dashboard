/**
 * Galerie de modèles d'import (extension de I-02).
 *
 * 5 templates contextualisés FR : basique, BtoB SaaS, Salon B2B, Formulaire
 * web inbound, Cabinet conseil. Chacun retourne un XLSX multi-feuilles
 * (Leads + Guide colonnes) ou un CSV `;`.
 *
 * Les `headers` correspondent exactement aux noms attendus par le worker
 * `processImport` (cf. apps/worker/src/handlers/index.ts → ColumnMapping)
 * pour que le mapping auto fonctionne sans intervention.
 */
import * as XLSX from "xlsx";

export type TemplateId = "basic" | "saas" | "salon" | "inbound" | "conseil";

export type ColumnSpec = {
  key: string;
  /** Libellé affiché dans l'en-tête de feuille */
  label: string;
  /** Documentation affichée dans l'onglet Guide */
  description: string;
  /** Exemple générique pour le guide */
  example: string;
  required?: boolean;
};

const ALL_COLUMNS: Record<string, ColumnSpec> = {
  email: {
    key: "email",
    label: "email",
    description: "Adresse email professionnelle du lead. Idéalement nominative.",
    example: "p.martin@acme.com",
    required: true,
  },
  phone: {
    key: "phone",
    label: "phone",
    description: "Numéro de téléphone, format libre (FR ou international).",
    example: "+33 6 12 34 56 78",
  },
  firstName: {
    key: "firstName",
    label: "firstName",
    description: "Prénom du contact.",
    example: "Paul",
  },
  lastName: {
    key: "lastName",
    label: "lastName",
    description: "Nom de famille du contact.",
    example: "Martin",
  },
  company: {
    key: "company",
    label: "company",
    description: "Nom de l'entreprise.",
    example: "Acme Tech",
  },
  website: {
    key: "website",
    label: "website",
    description: "Site web de l'entreprise (avec https://).",
    example: "https://acme.com",
  },
  sector: {
    key: "sector",
    label: "sector",
    description: "Secteur d'activité (SaaS, Retail, Industrie…).",
    example: "SaaS",
  },
  city: {
    key: "city",
    label: "city",
    description: "Ville du siège ou du contact.",
    example: "Paris",
  },
  country: {
    key: "country",
    label: "country",
    description: "Pays. Défaut : France.",
    example: "France",
  },
  source: {
    key: "source",
    label: "source",
    description: "Origine du lead (Salon, Webinar, LinkedIn, Cold call, Formulaire…).",
    example: "Inbound",
  },
  notes: {
    key: "notes",
    label: "notes",
    description: "Texte libre — contexte, remarques, prochaine étape.",
    example: "Rencontré au salon Tech 2026, intéressé par démo",
  },
};

const BASIC_COLUMNS = ["email", "firstName", "lastName", "company", "phone", "source", "notes"];
const FULL_COLUMNS = ["email", "phone", "firstName", "lastName", "company", "website", "sector", "city", "country", "source", "notes"];

export type Template = {
  id: TemplateId;
  name: string;
  description: string;
  /** Cas d'usage cible — affiché en tête de card UI */
  useCase: string;
  /** Couleur Ant Design pour le tag */
  color: string;
  /** Colonnes incluses dans ce modèle */
  columns: string[];
  /** Lignes d'exemple (toutes les colonnes du modèle) */
  examples: Record<string, string>[];
};

export const TEMPLATES: Record<TemplateId, Template> = {
  basic: {
    id: "basic",
    name: "Modèle basique",
    description: "Le minimum vital : nom, email, entreprise, téléphone, source.",
    useCase: "Premier import / fichier simple",
    color: "blue",
    columns: BASIC_COLUMNS,
    examples: [
      { email: "j.dupont@exemple.fr", firstName: "Jean", lastName: "Dupont", company: "Exemple SAS", phone: "+33 6 11 22 33 44", source: "Référencement", notes: "" },
      { email: "marie.lefevre@startup.io", firstName: "Marie", lastName: "Lefèvre", company: "Startup IO", phone: "", source: "LinkedIn", notes: "Décideuse marketing" },
      { email: "", firstName: "Pierre", lastName: "Bernard", company: "Bernard & Fils", phone: "+33 1 23 45 67 89", source: "Recommandation", notes: "Pas d'email, contacter par tél" },
    ],
  },

  saas: {
    id: "saas",
    name: "Prospection BtoB SaaS",
    description: "Entreprises tech avec site web, secteur SaaS, taille pour ICP.",
    useCase: "Cold outreach SaaS / tech",
    color: "purple",
    columns: FULL_COLUMNS,
    examples: [
      { email: "ceo@helio-data.io", phone: "+33 6 98 76 54 32", firstName: "Camille", lastName: "Roussel", company: "Helio Data", website: "https://helio-data.io", sector: "SaaS", city: "Paris", country: "France", source: "LinkedIn Sales Nav", notes: "Levée Série A 2025, ICP cible" },
      { email: "p.merlin@nimbus-cloud.fr", phone: "+33 1 47 28 90 12", firstName: "Pierre", lastName: "Merlin", company: "Nimbus Cloud", website: "https://nimbus-cloud.fr", sector: "Cloud", city: "Lyon", country: "France", source: "Webinar", notes: "S'est inscrit au webinar Q1 2026" },
      { email: "contact@kairos-labs.com", phone: "", firstName: "Léa", lastName: "Garnier", company: "Kairos Labs", website: "https://kairos-labs.com", sector: "AI/ML", city: "Toulouse", country: "France", source: "Référencement Google", notes: "" },
      { email: "j.fournier@stellaris-io.com", phone: "+33 7 11 22 33 44", firstName: "Julien", lastName: "Fournier", company: "Stellaris", website: "https://stellaris-io.com", sector: "DevOps", city: "Bordeaux", country: "France", source: "Référencement Google", notes: "Cherche outil de monitoring" },
      { email: "sophie.bertin@phoenixtech.fr", phone: "", firstName: "Sophie", lastName: "Bertin", company: "Phoenix Tech", website: "https://phoenixtech.fr", sector: "SaaS", city: "Nantes", country: "France", source: "Cold email", notes: "Réponse à séquence Q1" },
    ],
  },

  salon: {
    id: "salon",
    name: "Salon professionnel",
    description: "Contacts collectés sur stand — nominatifs avec carte de visite.",
    useCase: "Après un salon ou conférence",
    color: "orange",
    columns: ["email", "phone", "firstName", "lastName", "company", "sector", "city", "source", "notes"],
    examples: [
      { email: "isabelle.michel@retailpro.fr", phone: "+33 6 22 33 44 55", firstName: "Isabelle", lastName: "Michel", company: "RetailPro", sector: "Retail", city: "Paris", source: "Salon Paris 2026", notes: "Carte de visite stand B12 — démo planifiée" },
      { email: "n.laurent@medic-solutions.fr", phone: "+33 7 88 99 00 11", firstName: "Nicolas", lastName: "Laurent", company: "Medic Solutions", sector: "Santé", city: "Lille", source: "Salon Paris 2026", notes: "Cherche outil CRM pour son cabinet" },
      { email: "delphine.r@verdial.com", phone: "+33 6 44 55 66 77", firstName: "Delphine", lastName: "Robert", company: "Verdial", sector: "Industrie", city: "Strasbourg", source: "Salon Paris 2026", notes: "Décideuse achats, à recontacter en mai" },
      { email: "k.simon@beauty-line.fr", phone: "", firstName: "Karine", lastName: "Simon", company: "Beauty Line", sector: "E-commerce", city: "Marseille", source: "Salon Paris 2026", notes: "Refus d'email — appeler" },
      { email: "thomas.r@logiscan.fr", phone: "+33 6 33 22 11 00", firstName: "Thomas", lastName: "Riviera", company: "Logiscan", sector: "Logistique", city: "Le Havre", source: "Salon Paris 2026", notes: "" },
    ],
  },

  inbound: {
    id: "inbound",
    name: "Formulaire web inbound",
    description: "Leads ayant rempli un formulaire — déjà engagés.",
    useCase: "Lead form / téléchargement contenu",
    color: "green",
    columns: ["email", "firstName", "lastName", "company", "website", "source", "notes"],
    examples: [
      { email: "anne.fournier@gmail.com", firstName: "Anne", lastName: "Fournier", company: "Indépendante", website: "", source: "Formulaire — Téléchargement livre blanc", notes: "Téléchargé 'Guide CRM 2026' le 12/05" },
      { email: "contact@octogone-conseil.fr", firstName: "", lastName: "", company: "Octogone Conseil", website: "https://octogone-conseil.fr", source: "Formulaire — Demande de démo", notes: "Demande de démo via /demo le 10/05" },
      { email: "l.berger@scribe-it.io", firstName: "Lucas", lastName: "Berger", company: "Scribe IT", website: "https://scribe-it.io", source: "Formulaire — Newsletter", notes: "Inscription newsletter, secteur SaaS" },
      { email: "amelie@boutique-online.com", firstName: "Amélie", lastName: "Dubois", company: "Boutique Online", website: "https://boutique-online.com", source: "Formulaire — Demande d'essai", notes: "Demande d'essai 14 jours" },
    ],
  },

  conseil: {
    id: "conseil",
    name: "Cabinet conseil",
    description: "Cabinets, sociétés de service — focus secteur + notes contexte.",
    useCase: "Cabinets conseil / agences / ESN",
    color: "cyan",
    columns: ["email", "phone", "firstName", "lastName", "company", "website", "sector", "city", "notes"],
    examples: [
      { email: "associe@quanteo-consulting.fr", phone: "+33 1 56 78 90 12", firstName: "François", lastName: "Mercier", company: "Quanteo Consulting", website: "https://quanteo-consulting.fr", sector: "Conseil stratégie", city: "Paris", notes: "Associé fondateur, 25 consultants" },
      { email: "h.petit@delta-advisors.fr", phone: "+33 6 78 90 12 34", firstName: "Hélène", lastName: "Petit", company: "Delta Advisors", website: "https://delta-advisors.fr", sector: "Conseil financier", city: "Paris", notes: "Spécialisé M&A mid-market" },
      { email: "contact@oxalys-agency.com", phone: "+33 4 78 12 34 56", firstName: "", lastName: "", company: "Oxalys Agency", website: "https://oxalys-agency.com", sector: "Agence digitale", city: "Lyon", notes: "" },
      { email: "directeur@valoris-conseil.fr", phone: "+33 5 56 78 90 12", firstName: "Sébastien", lastName: "André", company: "Valoris Conseil", website: "https://valoris-conseil.fr", sector: "Conseil RH", city: "Bordeaux", notes: "DRH externalisé, intéressé par gestion talents" },
    ],
  },
};

export type TemplateMeta = {
  id: TemplateId;
  name: string;
  description: string;
  useCase: string;
  color: string;
  columnCount: number;
  exampleRowCount: number;
};

export function listTemplateMeta(): TemplateMeta[] {
  return (Object.keys(TEMPLATES) as TemplateId[]).map((id) => {
    const t = TEMPLATES[id];
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      useCase: t.useCase,
      color: t.color,
      columnCount: t.columns.length,
      exampleRowCount: t.examples.length,
    };
  });
}

export function buildTemplateXlsx(id: TemplateId): Buffer {
  const tpl = TEMPLATES[id];
  if (!tpl) throw new Error("Template inconnu");

  const wb = XLSX.utils.book_new();

  // Feuille principale : Leads (données d'exemple)
  const dataRows = tpl.examples.map((ex) =>
    Object.fromEntries(tpl.columns.map((c) => [c, ex[c] ?? ""])),
  );
  const wsLeads = XLSX.utils.json_to_sheet(dataRows, { header: tpl.columns });
  wsLeads["!cols"] = tpl.columns.map((c) => ({
    wch: c === "notes" ? 40 : c === "email" || c === "website" ? 30 : 16,
  }));
  XLSX.utils.book_append_sheet(wb, wsLeads, "Leads");

  // Feuille Guide : doc des colonnes
  const guideRows = tpl.columns.map((c) => {
    const spec = ALL_COLUMNS[c];
    return {
      "Colonne": spec?.label ?? c,
      "Description": spec?.description ?? "",
      "Exemple": spec?.example ?? "",
      "Obligatoire ?": spec?.required ? "Recommandé" : "Optionnel",
    };
  });
  const wsGuide = XLSX.utils.json_to_sheet(guideRows);
  wsGuide["!cols"] = [{ wch: 14 }, { wch: 60 }, { wch: 30 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, wsGuide, "Guide");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function buildTemplateCsv(id: TemplateId): string {
  const tpl = TEMPLATES[id];
  if (!tpl) throw new Error("Template inconnu");
  const esc = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    if (/[";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [
    tpl.columns.join(";"),
    ...tpl.examples.map((ex) => tpl.columns.map((c) => esc(ex[c] ?? "")).join(";")),
  ];
  return "﻿" + lines.join("\n"); // BOM Excel FR
}

// ──────────────────────────────────────────────────────────────────────────
// Auto-détection des colonnes du fichier importé (matching headers)
// ──────────────────────────────────────────────────────────────────────────

const HEADER_ALIASES: Record<string, string[]> = {
  email: ["email", "e-mail", "mail", "adresse email", "adresse e-mail", "adresse mail", "courriel"],
  phone: ["phone", "tel", "tél", "téléphone", "telephone", "mobile", "portable", "tel mobile"],
  firstName: ["firstname", "first_name", "first name", "prenom", "prénom", "given name"],
  lastName: ["lastname", "last_name", "last name", "nom", "nom de famille", "surname", "family name"],
  company: ["company", "entreprise", "société", "societe", "organization", "organisation"],
  website: ["website", "site", "site web", "url", "web", "homepage"],
  sector: ["sector", "secteur", "industry", "industrie", "domaine"],
  city: ["city", "ville", "town"],
  country: ["country", "pays", "country code"],
  source: ["source", "origine", "channel", "canal", "lead source"],
  notes: ["notes", "note", "remarques", "remarque", "comment", "commentaire", "context"],
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // accents
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Suggère un mapping `header du fichier → champ CRM` en s'appuyant sur les
 * alias FR/EN courants. Match déterministe : premier alias trouvé gagne.
 */
export function suggestMapping(headers: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  const usedFields = new Set<string>();
  for (const h of headers) {
    const norm = normalize(h);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (usedFields.has(field)) continue;
      if (aliases.some((a) => normalize(a) === norm)) {
        result[h] = field;
        usedFields.add(field);
        break;
      }
    }
    // Si pas de match exact, on tente un contains plus permissif
    if (!result[h]) {
      for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
        if (usedFields.has(field)) continue;
        if (aliases.some((a) => norm.includes(normalize(a)) || normalize(a).includes(norm))) {
          result[h] = field;
          usedFields.add(field);
          break;
        }
      }
    }
  }
  return result;
}
