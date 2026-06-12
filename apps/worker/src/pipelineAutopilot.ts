/**
 * Progression autonome du pipeline à partir des réponses email entrantes.
 * Avance le statut CRM + l'étape Kanban (jamais en arrière), selon la catégorie
 * IA/heuristique et le contenu du message (RDV confirmé, deal conclu, etc.).
 */
import { prisma, notifyUser, type LeadStatus } from "@crm/db";
import type { ReplyCategory } from "./replyCategorizer";

export type ReplyOutcome = "won" | "appointment" | "interested" | "callback" | "lost" | "discussion" | "none";

const STATUS_RANK: Record<LeadStatus, number> = {
  NOUVEAU: 0,
  CONTACTE: 1,
  QUALIFIE: 2,
  EN_DISCUSSION: 3,
  CONVERTI: 4,
  PERDU: 5,
};

const TRANSITIONS: Record<LeadStatus, LeadStatus[]> = {
  NOUVEAU: ["CONTACTE", "QUALIFIE", "PERDU"],
  CONTACTE: ["QUALIFIE", "EN_DISCUSSION", "PERDU", "NOUVEAU"],
  QUALIFIE: ["EN_DISCUSSION", "CONVERTI", "PERDU", "CONTACTE"],
  EN_DISCUSSION: ["CONVERTI", "PERDU", "QUALIFIE"],
  CONVERTI: ["EN_DISCUSSION"],
  PERDU: ["NOUVEAU", "CONTACTE"],
};

const OUTCOME_TARGET: Record<
  Exclude<ReplyOutcome, "none">,
  { status: LeadStatus; stageNames: string[] }
> = {
  won: { status: "CONVERTI", stageNames: ["Gagné", "Gagne", "Converti"] },
  appointment: { status: "EN_DISCUSSION", stageNames: ["Négociation", "Negociation", "En discussion"] },
  interested: { status: "EN_DISCUSSION", stageNames: ["Proposition", "Négociation", "Negociation", "En discussion"] },
  callback: { status: "QUALIFIE", stageNames: ["Qualifié", "Qualifie"] },
  lost: { status: "PERDU", stageNames: ["Perdu"] },
  discussion: { status: "EN_DISCUSSION", stageNames: ["Négociation", "Negociation", "Proposition", "En discussion"] },
};

function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

function stripHtml(html: string | null): string {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Détecte l'intention commerciale à partir du texte + catégorie. */
export function detectReplyOutcome(args: {
  category: ReplyCategory;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
}): ReplyOutcome {
  const text = `${args.subject ?? ""}\n${args.bodyText ?? stripHtml(args.bodyHtml)}`.toLowerCase();

  if (
    /sign[ée]|contrat sign|valid[ée]|on valide|on part|go pour|commande pass|abonnement|deal conclu|partenariat sign|c'?est bon pour nous|accepte (la )?proposition|nous sommes d'accord|parfait pour nous/.test(
      text,
    )
  ) {
    return "won";
  }

  if (
    /rdv confirm|confirm[ée].*(cr[ée]neau|rdv|rendez|call|visio)|je confirme (le|notre|un)|ok pour (le|un|mardi|mercredi|jeudi|vendredi|lundi)|disponible (le|à|mardi|mercredi|jeudi|vendredi|lundi)|cr[ée]neau (de|à|le|confirm)|booked|calendly\.com|teams\.microsoft|zoom\.us|google meet|meet\.google/.test(
      text,
    )
  ) {
    return "appointment";
  }

  if (args.category === "pas_interesse") return "lost";
  if (args.category === "rappel") return "callback";

  if (args.category === "interesse") {
    if (/rdv|rendez[- ]vous|d[ée]mo|call|visio|cr[ée]neau|disponibilit|meeting|entretien/.test(text)) {
      return "appointment";
    }
    return "interested";
  }

  if (args.category === "hors_sujet" || args.category === "auto_reply") return "none";

  // Réponse humaine non classée → discussion si le lead répond.
  return "discussion";
}

function shouldAdvanceStatus(current: LeadStatus, target: LeadStatus): boolean {
  if (current === target) return false;
  if (target === "PERDU" || target === "CONVERTI") return true;
  return STATUS_RANK[target] > STATUS_RANK[current];
}

async function findStageByNames(
  names: string[],
  ownerUserId: string,
): Promise<{ id: string; name: string; order: number } | null> {
  const stages = await prisma.pipelineStage.findMany({
    where: { ownerUserId },
    orderBy: { order: "asc" },
  });
  // On renvoie la dernière étape (la plus avancée) parmi les alias fournis.
  // Exemple: "Proposition" + "Négociation" (même statut EN_DISCUSSION) →
  // on préfère "Négociation" si elle existe.
  const lowered = new Set(names.map((n) => n.trim().toLowerCase()));
  const matches = stages.filter((s) => lowered.has(s.name.trim().toLowerCase()));
  if (!matches.length) return null;
  return matches.reduce((acc, cur) => (cur.order > acc.order ? cur : acc));
}

function shouldAdvanceStage(
  currentStage: { id: string; order: number } | null,
  targetStage: { id: string; order: number },
  targetStatus: LeadStatus,
): boolean {
  if (targetStatus === "PERDU" || targetStatus === "CONVERTI") return true;
  if (!currentStage) return true;
  if (currentStage.id === targetStage.id) return false;
  return targetStage.order > currentStage.order;
}

/**
 * Fait avancer un lead dans le pipeline après une réponse entrante (best-effort).
 */
export async function autopilotPipelineOnReply(args: {
  leadId: string;
  category: ReplyCategory;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  receivedAt: Date;
}): Promise<{ outcome: ReplyOutcome; statusChanged: boolean; stageChanged: boolean }> {
  const outcome = detectReplyOutcome(args);
  if (outcome === "none") {
    return { outcome, statusChanged: false, stageChanged: false };
  }

  const target = OUTCOME_TARGET[outcome];
  const lead = await prisma.lead.findUnique({
    where: { id: args.leadId },
    select: { id: true, status: true, pipelineStageId: true, deletedAt: true, ownerUserId: true },
  });
  if (!lead || lead.deletedAt || !lead.ownerUserId) {
    return { outcome, statusChanged: false, stageChanged: false };
  }

  const statusChanged = shouldAdvanceStatus(lead.status, target.status);
  const stage = await findStageByNames(target.stageNames, lead.ownerUserId);

  let currentStage: { id: string; order: number } | null = null;
  if (lead.pipelineStageId) {
    currentStage = await prisma.pipelineStage.findUnique({
      where: { id: lead.pipelineStageId },
      select: { id: true, order: true },
    });
  }

  const stageChanged = Boolean(
    stage && shouldAdvanceStage(currentStage, stage, target.status),
  );

  if (!statusChanged && !stageChanged) {
    await prisma.lead.update({
      where: { id: args.leadId },
      data: { lastReplyAt: args.receivedAt, lastActionAt: args.receivedAt },
    });
    return { outcome, statusChanged: false, stageChanged: false };
  }

  await prisma.lead.update({
    where: { id: args.leadId },
    data: {
      lastReplyAt: args.receivedAt,
      lastActionAt: args.receivedAt,
      ...(statusChanged ? { status: target.status } : {}),
      ...(stageChanged && stage ? { pipelineStageId: stage.id } : {}),
    },
  });

  if (stageChanged && stage) {
    await prisma.leadPipeline.upsert({
      where: { leadId: args.leadId },
      create: {
        leadId: args.leadId,
        stageId: stage.id,
        position: 0,
        enteredAt: args.receivedAt,
      },
      update: {
        stageId: stage.id,
        enteredAt: args.receivedAt,
      },
    });
  }

  await prisma.leadHistory.create({
    data: {
      leadId: args.leadId,
      type: "pipeline_autopilot",
      payload: {
        outcome,
        category: args.category,
        fromStatus: lead.status,
        toStatus: statusChanged ? target.status : lead.status,
        fromStageId: lead.pipelineStageId,
        toStageId: stageChanged && stage ? stage.id : lead.pipelineStageId,
        toStageName: stage?.name ?? null,
      } as object,
    },
  });

  // Notifier le commercial assigné sur les avancées clés.
  if (outcome === "won" || outcome === "appointment") {
    try {
      const meta = await prisma.lead.findUnique({
        where: { id: args.leadId },
        select: {
          assignedToId: true,
          firstName: true,
          lastName: true,
          company: true,
        },
      });
      if (meta?.assignedToId) {
        const name = [meta.firstName, meta.lastName].filter(Boolean).join(" ") || meta.company || "Un lead";
        await notifyUser({
          userId: meta.assignedToId,
          type: outcome === "won" ? "pipeline_won" : "pipeline_appointment",
          title: outcome === "won" ? "Deal conclu — pipeline mis à jour" : "RDV obtenu — pipeline mis à jour",
          body: `${name} avancé automatiquement${args.subject ? ` : "${args.subject.slice(0, 80)}"` : ""}.`,
          link: `/leads/${args.leadId}`,
        });
      }
    } catch (e) {
      console.warn(
        `[pipeline-autopilot] notif KO leadId=${args.leadId}:`,
        e instanceof Error ? e.message : e,
      );
    }
  }

  if (statusChanged || stageChanged) {
    console.log(
      `[pipeline-autopilot] leadId=${args.leadId} outcome=${outcome} ` +
        `status=${lead.status}→${statusChanged ? target.status : lead.status} ` +
        `stage=${stageChanged ? stage?.name : "—"}`,
    );
  }

  return { outcome, statusChanged, stageChanged };
}
