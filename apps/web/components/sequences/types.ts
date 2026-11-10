export type Step = {
  delayDays: number;
  templateId?: string | null;
  subject?: string | null;
  bodyHtml?: string | null;
  stopOnReply?: boolean;
  aiPersonalize?: boolean;
};

export type SequenceRow = {
  id: string;
  name: string;
  steps: Step[];
  maxSteps: number | null;
  isPaused: boolean;
  createdAt: string;
  updatedAt: string;
  stats?: Record<string, number>;
};

export type SequenceLeadRow = {
  id: string;
  leadId: string;
  currentStep: number;
  nextSendAt: string | null;
  sentCount: number;
  status: string;
  stoppedReason: string | null;
  createdAt: string;
  lead: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    status: string;
    emailStatus: string;
    lastReplyAt: string | null;
  };
};

/** Jour d'envoi cumulé de chaque étape (J+0, J+3, J+7…). */
export function stepDays(steps: Pick<Step, "delayDays">[]): number[] {
  let day = 0;
  return steps.map((s) => (day += Math.max(0, Number(s.delayDays ?? 0))));
}

export const SEQ_LEAD_STATUS: Record<string, { label: string; color: string }> = {
  active: { label: "En cours", color: "#a78bfa" },
  paused: { label: "En pause", color: "#fbbf24" },
  completed: { label: "Terminé", color: "#8b5cf6" },
  stopped: { label: "Arrêté", color: "#fb7185" },
};

export const STOP_REASON: Record<string, string> = {
  reply: "Réponse reçue",
  unsubscribed: "Désinscription",
  hard_bounce: "Hard bounce",
  blacklisted: "Blacklist",
  lead_deleted: "Lead supprimé",
  lead_missing: "Lead introuvable",
  manual: "Retiré manuellement",
};
