/** Bases légales RGPD pour les notes sur les leads. */
export const LEAD_NOTE_LEGAL_BASES = [
  { value: "consent", label: "Consentement (RGPD art. 6.1.a)" },
  { value: "contract", label: "Exécution contractuelle (art. 6.1.b)" },
  { value: "legal_obligation", label: "Obligation légale (art. 6.1.c)" },
  { value: "vital_interest", label: "Intérêts vitaux (art. 6.1.d)" },
  { value: "public_task", label: "Mission d'intérêt public (art. 6.1.e)" },
  { value: "legitimate_interest", label: "Intérêt légitime (art. 6.1.f)" },
  { value: "internal", label: "Note interne (sans donnée personnelle)" },
] as const;

export type LeadNoteLegalBasis = (typeof LEAD_NOTE_LEGAL_BASES)[number]["value"];

export function legalBasisLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return LEAD_NOTE_LEGAL_BASES.find((b) => b.value === value)?.label ?? value;
}
