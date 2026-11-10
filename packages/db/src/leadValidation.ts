/**
 * Validation et normalisation des coordonnées d'un lead (I-03 / I-07), partagées par l'API web
 * et le traitement d'import (packages/jobs). Fonctions pures : testables sans base.
 *
 *  - email     : même règle que `z.string().email()` (zod 3.25), utilisée par les formulaires et l'API ;
 *  - téléphone : numéro français normalisé en E.164 (+33XXXXXXXXX), même règle que le scraper
 *                (apps/scraper/app/contacts.py · normalize_fr_phone) ; numéro international « +… » accepté ;
 *  - URL       : http(s) avec un nom de domaine complet, sans paramètres de suivi (cleanWebsiteUrl).
 *
 * Les raisons sont rédigées pour le rapport d'import : elles ne recopient jamais la valeur (PII).
 */
import { cleanWebsiteUrl } from "./scraping";

export type FieldCheck = { ok: true; value: string } | { ok: false; reason: string };

/** Expression de `z.string().email()` (zod 3.25, `v3/types.js`) — à garder alignée. */
export const EMAIL_FORMAT = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;

export function checkEmail(raw: string): FieldCheck {
  const v = raw.trim().toLowerCase();
  if (EMAIL_FORMAT.test(v)) return { ok: true, value: v };
  const at = v.split("@");
  const reason = /\s/.test(v)
    ? "contient un espace"
    : at.length !== 2
      ? at.length < 2 ? "« @ » manquant" : "plusieurs « @ »"
      : !at[0]
        ? "partie avant « @ » vide"
        : !/\.[a-z]{2,}$/i.test(at[1] ?? "")
          ? "domaine sans extension valide (ex. .fr, .com)"
          : "caractères non autorisés";
  return { ok: false, reason: `format d'email invalide : ${reason}` };
}

/** Numéro français → E.164 (+33XXXXXXXXX), ou null (portage de normalize_fr_phone du scraper). */
export function normalizeFrPhone(raw: string): string | null {
  let digits = (raw ?? "").replace(/\D+/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2); // 0033… → 33…
  if (digits.startsWith("330") && digits.length === 12) digits = digits.slice(2); // +33 (0)6… → 06…
  else if (digits.startsWith("33") && digits.length === 11) digits = "0" + digits.slice(2);
  if (digits.length !== 10 || !digits.startsWith("0") || digits[1] === "0") return null;
  return "+33" + digits.slice(1);
}

export function checkPhone(raw: string): FieldCheck {
  const v = raw.trim();
  const fr = normalizeFrPhone(v);
  if (fr) return { ok: true, value: fr };
  // Numéro étranger déjà au format international : conservé en E.164 (+ et 8 à 15 chiffres).
  const intl = v.replace(/[\s.\-()]/g, "");
  if (/^(\+|00)\d{8,15}$/.test(intl) && !/^(\+|00)33/.test(intl)) return { ok: true, value: "+" + intl.replace(/^(\+|00)/, "") };
  const digits = v.replace(/\D+/g, "");
  const reason = /[a-z]/i.test(v)
    ? "contient des lettres"
    : digits.length < 10
      ? `trop court (${digits.length} chiffre${digits.length > 1 ? "s" : ""})`
      : digits.length > 15
        ? "trop long"
        : "numéro français non reconnu (attendu : 0X XX XX XX XX ou +33…)";
  return { ok: false, reason: `téléphone invalide : ${reason}` };
}

export function checkWebsite(raw: string): FieldCheck {
  const v = raw.trim();
  if (/\s/.test(v)) return { ok: false, reason: "URL invalide : contient un espace" };
  if (/^[a-z][a-z0-9+.-]*:/i.test(v) && !/^https?:\/\//i.test(v)) {
    return { ok: false, reason: "URL invalide : seuls http:// et https:// sont acceptés" };
  }
  let host: string;
  try {
    host = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname;
  } catch {
    return { ok: false, reason: "URL invalide : adresse illisible" };
  }
  if (!/^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)) {
    return { ok: false, reason: "URL invalide : nom de domaine incomplet (ex. exemple.fr)" };
  }
  return { ok: true, value: cleanWebsiteUrl(v) ?? v };
}

// ── Contrôle d'une ligne d'import ───────────────────────────────────────────

export type ImportRowField =
  | "email" | "phone" | "firstName" | "lastName" | "company"
  | "website" | "sector" | "city" | "country" | "source" | "notes";

export type ImportRowValues = Partial<Record<ImportRowField, string | null>>;

/** Une anomalie de ligne : `rejected` (ligne écartée) ou `cleaned` (valeur invalide retirée, ligne importée). */
export type ImportIssue = { row: number; action: "rejected" | "cleaned"; field: ImportRowField | null; reason: string };

export type ImportRowCheck = { values: ImportRowValues; rejected: boolean; issues: ImportIssue[] };

export const IMPORT_FIELD_LABELS: Record<ImportRowField, string> = {
  email: "Email", phone: "Téléphone", firstName: "Prénom", lastName: "Nom", company: "Entreprise",
  website: "Site web", sector: "Secteur", city: "Ville", country: "Pays", source: "Source", notes: "Notes",
};

const FORMAT_CHECKS: Partial<Record<ImportRowField, (raw: string) => FieldCheck>> = {
  email: checkEmail,
  phone: checkPhone,
  website: checkWebsite,
};

/** Règle par défaut des colonnes obligatoires : l'email s'il est mappé, sinon l'entreprise. */
export function defaultRequiredFields(mapped: Iterable<string>): ImportRowField[] {
  const set = new Set(mapped);
  if (set.has("email")) return ["email"];
  if (set.has("company")) return ["company"];
  return [];
}

/**
 * Valide une ligne (valeurs déjà extraites selon le mapping, `row` = numéro de ligne du fichier) :
 *  1. format de l'email, du téléphone et de l'URL — valeur normalisée si valide ; sinon la ligne est
 *     rejetée si le champ est obligatoire, ou la valeur est retirée (ligne « nettoyée ») ;
 *  2. colonnes obligatoires non vides ;
 *  3. au moins une donnée identifiable (email, nom, prénom ou entreprise).
 */
export function checkImportRow(row: number, input: ImportRowValues, requiredFields: readonly ImportRowField[]): ImportRowCheck {
  const values: ImportRowValues = {};
  const issues: ImportIssue[] = [];
  const required = new Set(requiredFields);

  for (const [k, v] of Object.entries(input) as [ImportRowField, string | null | undefined][]) {
    const trimmed = v == null ? "" : String(v).trim();
    values[k] = trimmed || null;
  }

  for (const [field, check] of Object.entries(FORMAT_CHECKS) as [ImportRowField, (raw: string) => FieldCheck][]) {
    const raw = values[field];
    if (!raw) continue;
    const r = check(raw);
    if (r.ok) {
      values[field] = r.value;
    } else if (required.has(field)) {
      issues.push({ row, action: "rejected", field, reason: `${r.reason} (colonne obligatoire)` });
    } else {
      values[field] = null;
      issues.push({ row, action: "cleaned", field, reason: `${r.reason} — valeur ignorée, ligne importée sans ce champ` });
    }
  }

  const missing = requiredFields.filter((f) => !values[f] && !issues.some((i) => i.field === f && i.action === "rejected"));
  if (missing.length) {
    issues.push({
      row,
      action: "rejected",
      field: missing[0] ?? null,
      reason: `colonne${missing.length > 1 ? "s" : ""} obligatoire${missing.length > 1 ? "s" : ""} vide${missing.length > 1 ? "s" : ""} : ${missing.map((f) => IMPORT_FIELD_LABELS[f]).join(", ")}`,
    });
  }

  if (!issues.some((i) => i.action === "rejected") && !values.email && !values.firstName && !values.lastName && !values.company) {
    issues.push({ row, action: "rejected", field: null, reason: "aucune donnée identifiable (email, nom ou entreprise)" });
  }

  return { values, rejected: issues.some((i) => i.action === "rejected"), issues };
}

/** Répartition à tour de rôle : le n-ième lead importé (0, 1, 2…) va au commercial n mod N. */
export function roundRobinAssignee(assigneeIds: readonly string[], index: number): string | null {
  if (!assigneeIds.length) return null;
  return assigneeIds[index % assigneeIds.length] ?? null;
}
