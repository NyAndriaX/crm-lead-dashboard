/**
 * Variables de fusion des emails ({{prenom}}, {{nom}}, {{entreprise}}, {{email}}).
 * Les alias anglais ({{firstName}}, {{lastName}}, {{company}}) sont acceptés pour les
 * templates importés : un prospect ne doit jamais recevoir une accolade non remplacée.
 */
export type MergeLead = { firstName: string | null; lastName: string | null; company: string | null; email: string | null };

const VARS: [RegExp, (l: MergeLead) => string][] = [
  [/\{\{\s*(prenom|firstName|first_name)\s*\}\}/gi, (l) => l.firstName ?? ""],
  [/\{\{\s*(nom|lastName|last_name)\s*\}\}/gi, (l) => l.lastName ?? ""],
  [/\{\{\s*(entreprise|company)\s*\}\}/gi, (l) => l.company ?? ""],
  [/\{\{\s*email\s*\}\}/gi, (l) => l.email ?? ""],
  [/\{\{\s*(actu|custom)\s*\}\}/gi, () => ""],
];

export function applyMergeVariables(text: string, lead: MergeLead): string {
  return VARS.reduce((acc, [re, value]) => acc.replace(re, value(lead)), text);
}
