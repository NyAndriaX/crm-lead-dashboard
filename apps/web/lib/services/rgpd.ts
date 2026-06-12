/**
 * Service RGPD (SEC-04).
 *
 * - eraseLead     : droit à l'oubli (article 17 RGPD) — hard delete d'un lead
 *                   et de toutes ses traces (history, events, inbox, sequences,
 *                   pipeline). Audit minimal conservé (sans donnée PII) pour
 *                   prouver l'exécution.
 * - exportLead    : portabilité (article 20) — export JSON complet déchiffré.
 * - dataRegistry  : liste des traitements de données personnelles tenue à jour
 *                   par les admins (article 30 — registre des activités de
 *                   traitement).
 */
import { prisma, blockEmailHash, GDPR_ERASE_REASON, assertLeadAccess, buildLeadVisibilityWhere, type DataScope } from "@crm/db";
import { decryptOrNull } from "@/lib/crypto";

// ── Droit à l'oubli ──────────────────────────────────────────────────────────

export type EraseResult = {
  leadId: string;
  removed: {
    lead: boolean;
    leadHistory: number;
    emailEvents: number;
    inboxMessages: number;
    sequenceLeads: number;
    leadPipeline: number;
  };
};

export async function eraseLead(leadId: string, scope: DataScope, erasedBy?: string): Promise<EraseResult> {
  await assertLeadAccess(scope, leadId);
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, emailHash: true },
  });
  if (!lead) {
    return {
      leadId,
      removed: { lead: false, leadHistory: 0, emailEvents: 0, inboxMessages: 0, sequenceLeads: 0, leadPipeline: 0 },
    };
  }

  if (lead.emailHash) {
    await blockEmailHash({
      emailHash: lead.emailHash,
      reason: GDPR_ERASE_REASON,
      erasedBy: erasedBy ?? null,
    });
  }

  // Ordre important : enfants d'abord pour respecter les FK Prisma (relations
  // requises sur LeadPipeline / SequenceLead côté lead).
  const [hist, events, inbox, seq, pipe] = await prisma.$transaction([
    prisma.leadHistory.deleteMany({ where: { leadId } }),
    prisma.emailEvent.deleteMany({ where: { leadId } }),
    prisma.inboxMessage.deleteMany({ where: { leadId } }),
    prisma.sequenceLead.deleteMany({ where: { leadId } }),
    prisma.leadPipeline.deleteMany({ where: { leadId } }),
  ]);
  await prisma.lead.delete({ where: { id: leadId } });

  return {
    leadId,
    removed: {
      lead: true,
      leadHistory: hist.count,
      emailEvents: events.count,
      inboxMessages: inbox.count,
      sequenceLeads: seq.count,
      leadPipeline: pipe.count,
    },
  };
}

// ── Portabilité — export complet ─────────────────────────────────────────────

export type LeadExport = {
  exportedAt: string;
  lead: {
    id: string;
    email: string | null;
    phone: string | null;
    firstName: string | null;
    lastName: string | null;
    company: string | null;
    website: string | null;
    sector: string | null;
    city: string | null;
    country: string | null;
    source: string | null;
    status: string;
    emailStatus: string;
    score: number;
    tags: string[];
    notes: string | null;
    assignedToId: string | null;
    enrichment: unknown;
    lastActionAt: string | null;
    lastReplyAt: string | null;
    deletedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  leadHistory: { id: string; type: string; userId: string | null; payload: unknown; createdAt: string }[];
  emailEvents: { id: string; eventType: string; campaignId: string | null; sequenceId: string | null; url: string | null; meta: unknown; occurredAt: string }[];
  inboxMessages: { id: string; messageId: string; direction: string; from: string; to: string; subject: string | null; bodyText: string | null; bodyHtml: string | null; isAutoReply: boolean; category: string | null; receivedAt: string }[];
  sequenceLeads: { id: string; sequenceId: string; currentStep: number; sentCount: number; status: string; stoppedReason: string | null; nextSendAt: string | null }[];
};

export async function exportLead(leadId: string, scope: DataScope): Promise<LeadExport | null> {
  await assertLeadAccess(scope, leadId);
  const lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) return null;

  const [history, events, inbox, seqLeads] = await Promise.all([
    prisma.leadHistory.findMany({ where: { leadId }, orderBy: { createdAt: "asc" } }),
    prisma.emailEvent.findMany({ where: { leadId }, orderBy: { occurredAt: "asc" } }),
    prisma.inboxMessage.findMany({ where: { leadId }, orderBy: { receivedAt: "asc" } }),
    prisma.sequenceLead.findMany({ where: { leadId } }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    lead: {
      id: lead.id,
      email: decryptOrNull(lead.emailEnc),
      phone: decryptOrNull(lead.phoneEnc),
      firstName: lead.firstName,
      lastName: lead.lastName,
      company: lead.company,
      website: lead.website,
      sector: lead.sector,
      city: lead.city,
      country: lead.country,
      source: lead.source,
      status: lead.status,
      emailStatus: lead.emailStatus,
      score: lead.score,
      tags: lead.tags as string[],
      notes: lead.notes,
      assignedToId: lead.assignedToId,
      enrichment: lead.enrichment,
      lastActionAt: lead.lastActionAt?.toISOString() ?? null,
      lastReplyAt: lead.lastReplyAt?.toISOString() ?? null,
      deletedAt: lead.deletedAt?.toISOString() ?? null,
      createdAt: lead.createdAt.toISOString(),
      updatedAt: lead.updatedAt.toISOString(),
    },
    leadHistory: history.map((h) => ({
      id: h.id, type: h.type, userId: h.userId, payload: h.payload, createdAt: h.createdAt.toISOString(),
    })),
    emailEvents: events.map((e) => ({
      id: e.id, eventType: String(e.eventType), campaignId: e.campaignId, sequenceId: e.sequenceId,
      url: e.url, meta: e.meta, occurredAt: e.occurredAt.toISOString(),
    })),
    inboxMessages: inbox.map((m) => ({
      id: m.id, messageId: m.messageId, direction: m.direction,
      from: decryptOrNull(m.fromEnc) ?? "",
      to: decryptOrNull(m.toEnc) ?? "",
      subject: m.subject, bodyText: m.bodyText, bodyHtml: m.bodyHtml,
      isAutoReply: m.isAutoReply, category: m.category,
      receivedAt: m.receivedAt.toISOString(),
    })),
    sequenceLeads: seqLeads.map((s) => ({
      id: s.id, sequenceId: s.sequenceId, currentStep: s.currentStep, sentCount: s.sentCount,
      status: s.status, stoppedReason: s.stoppedReason,
      nextSendAt: s.nextSendAt?.toISOString() ?? null,
    })),
  };
}

// ── Registre des traitements (article 30) ───────────────────────────────────
// Document statique versionné en code : il décrit les traitements actifs
// pour la conformité légale. À mettre à jour quand le périmètre change.

export type DataProcessing = {
  id: string;
  name: string;
  purpose: string;
  legalBasis:
    | "consent"
    | "contract"
    | "legal_obligation"
    | "vital_interests"
    | "public_interest"
    | "legitimate_interest";
  categories: string[];
  retention: string;
  recipients: string;
  transfer: string;
  security: string;
};

export const DATA_REGISTRY: DataProcessing[] = [
  {
    id: "leads",
    name: "Gestion des leads commerciaux",
    purpose: "Suivi commercial, scoring, qualification, segmentation",
    legalBasis: "legitimate_interest",
    categories: ["Identité (nom, prénom)", "Coordonnées (email, téléphone, adresse)", "Données professionnelles (entreprise, secteur)", "Comportement (score, tags, notes)"],
    retention: "3 ans après dernier contact, puis archivage ou suppression sur demande",
    recipients: "Équipes commerciales internes uniquement",
    transfer: "Aucun transfert hors UE",
    security: "Chiffrement AES-256-GCM des emails et téléphones, hash HMAC pour la recherche, accès RBAC, audit log de toutes les modifications.",
  },
  {
    id: "campaigns",
    name: "Campagnes emailing",
    purpose: "Envoi d'emails de prospection commerciale",
    legalBasis: "legitimate_interest",
    categories: ["Email professionnel", "Statistiques d'engagement (ouvertures, clics)"],
    retention: "Statistiques agrégées 3 ans, events détaillés 12 mois",
    recipients: "Serveurs SMTP partenaires (Mailtrap, OVH, etc.), équipes internes",
    transfer: "Selon serveur SMTP — vérifier le contrat de sous-traitance avec l'hébergeur retenu",
    security: "Lien de désabonnement obligatoire (RFC 8058 One-Click), List-Unsubscribe sur chaque email, blacklist automatique sur unsubscribe/bounce. Tracking par token HMAC sans base de données.",
  },
  {
    id: "inbox",
    name: "Boîte de réception centralisée (réponses)",
    purpose: "Centralisation et catégorisation des réponses à nos campagnes",
    legalBasis: "legitimate_interest",
    categories: ["Email professionnel", "Contenu des messages (corps + sujet)"],
    retention: "12 mois puis archivage",
    recipients: "Équipes commerciales assignées au lead",
    transfer: "OpenAI (catégorisation IA) si activé — sujet + 2000 premiers caractères du corps. Aucune information directement identifiante n'est demandée mais le corps peut en contenir.",
    security: "Connexion IMAP chiffrée, credentials AES-256-GCM. Bouton de re-catégorisation manuelle disponible.",
  },
  {
    id: "auth",
    name: "Authentification et journalisation",
    purpose: "Sécuriser l'accès au CRM et tracer les actions des utilisateurs",
    legalBasis: "contract",
    categories: ["Email professionnel", "Mot de passe haché (bcrypt cost 12)", "Secret TOTP chiffré", "IP de connexion"],
    retention: "Audit log 12 mois (TTL), credentials tant que le compte est actif",
    recipients: "Administrateurs internes uniquement",
    transfer: "Aucun",
    security: "Bcrypt cost 12, 2FA TOTP optionnelle, JWT court + refresh token avec tokenVersion, logout forcé possible par admin.",
  },
];

export function getDataRegistry(): DataProcessing[] {
  return DATA_REGISTRY;
}

// ── Leads archivés (soft delete) ─────────────────────────────────────────────

export type ArchivedLeadItem = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string | null;
  source: string | null;
  status: string;
  deletedAt: string;
  createdAt: string;
};

export async function listArchivedLeads(scope: DataScope, opts: { page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const where = {
    AND: [{ deletedAt: { not: null } as const }, buildLeadVisibilityWhere(scope)],
  };
  const [rows, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { deletedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        company: true,
        emailEnc: true,
        source: true,
        status: true,
        deletedAt: true,
        createdAt: true,
      },
    }),
    prisma.lead.count({ where }),
  ]);
  return {
    data: rows.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      company: r.company,
      email: decryptOrNull(r.emailEnc),
      source: r.source,
      status: r.status,
      deletedAt: r.deletedAt!.toISOString(),
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}

// ── Contacts supprimés RGPD (blacklist) ───────────────────────────────────────

export type GdprErasedItem = {
  id: string;
  emailHashPrefix: string;
  reason: string | null;
  erasedBy: string | null;
  erasedByName: string | null;
  createdAt: string;
};

/** Passe un lead archivé en suppression RGPD définitive (blacklist email). */
export async function eraseArchivedLead(leadId: string, scope: DataScope, erasedBy?: string): Promise<EraseResult> {
  await assertLeadAccess(scope, leadId);
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, deletedAt: true, emailHash: true },
  });
  if (!lead || !lead.deletedAt) {
    return {
      leadId,
      removed: { lead: false, leadHistory: 0, emailEvents: 0, inboxMessages: 0, sequenceLeads: 0, leadPipeline: 0 },
    };
  }
  return eraseLead(leadId, scope, erasedBy);
}

export async function listGdprErasedContacts(opts: { page?: number; pageSize?: number } = {}) {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
  const where = { reason: GDPR_ERASE_REASON };
  const [rows, total] = await Promise.all([
    prisma.blacklist.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.blacklist.count({ where }),
  ]);
  const userIds = rows.map((r) => r.erasedBy).filter(Boolean) as string[];
  const users = userIds.length
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
    : [];
  const nameById = new Map(users.map((u) => [u.id, u.name]));
  return {
    data: rows.map((r) => ({
      id: r.id,
      emailHashPrefix: `${r.emailHash.slice(0, 12)}…`,
      reason: r.reason,
      erasedBy: r.erasedBy,
      erasedByName: r.erasedBy ? nameById.get(r.erasedBy) ?? null : null,
      createdAt: r.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
  };
}
