// Workflow des statuts de lead — CRM-014. Machine à états : transitions autorisées.
import type { LeadStatus } from "@crm/db";

export const STATUS_LABELS: Record<LeadStatus, string> = {
  NOUVEAU: "Nouveau",
  CONTACTE: "Contacté",
  QUALIFIE: "Qualifié",
  EN_DISCUSSION: "En discussion",
  CONVERTI: "Converti",
  PERDU: "Perdu",
};

export const STATUS_COLORS: Record<LeadStatus, string> = {
  NOUVEAU: "default",
  CONTACTE: "blue",
  QUALIFIE: "cyan",
  EN_DISCUSSION: "gold",
  CONVERTI: "green",
  PERDU: "red",
};

// Transitions autorisées (un lead "Perdu" peut être réactivé vers Nouveau/Contacté).
const TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NOUVEAU: ["CONTACTE", "QUALIFIE", "PERDU"],
  CONTACTE: ["QUALIFIE", "EN_DISCUSSION", "PERDU", "NOUVEAU"],
  QUALIFIE: ["EN_DISCUSSION", "CONVERTI", "PERDU", "CONTACTE"],
  EN_DISCUSSION: ["CONVERTI", "PERDU", "QUALIFIE"],
  CONVERTI: ["EN_DISCUSSION"], // ré-ouverture exceptionnelle
  PERDU: ["NOUVEAU", "CONTACTE"],
};

export function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  if (from === to) return true; // idempotent
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function allowedTransitions(from: LeadStatus): LeadStatus[] {
  return TRANSITIONS[from] ?? [];
}

/** Statuts "terminaux côté prospection" : on arrête les séquences de relance en y entrant. */
export const STOPS_SEQUENCES: LeadStatus[] = ["CONVERTI", "PERDU", "EN_DISCUSSION"];
