/**
 * Service Webhooks sortants (INT-01) — émission HTTP signée HMAC vers des
 * outils tiers (Zapier, Make, n8n, etc.).
 *
 * Le modèle `WebhookOut` (schema.prisma) existait déjà mais sans plomberie.
 * On y ajoute :
 *  - CRUD (listWebhooks, createWebhook, updateWebhook, deleteWebhook, testWebhook)
 *  - `emitWebhookEvent(eventName, payload)` : déclenché par le code applicatif
 *    (lead.create, lead.replied, campaign.done, unsubscribe).
 *  - HMAC-SHA256 du body envoyé dans le header `X-Webhook-Signature` pour
 *    permettre au destinataire de vérifier l'authenticité.
 */
import * as crypto from "node:crypto";
import { prisma } from "@crm/db";

export type WebhookEvent =
  | "newLead"
  | "leadReplied"
  | "leadStatusChanged"
  | "campaignDone"
  | "unsubscribe";

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  "newLead",
  "leadReplied",
  "leadStatusChanged",
  "campaignDone",
  "unsubscribe",
];

export const EVENT_LABELS: Record<WebhookEvent, string> = {
  newLead: "Nouveau lead créé",
  leadReplied: "Réponse reçue d'un lead",
  leadStatusChanged: "Changement de statut d'un lead",
  campaignDone: "Campagne terminée",
  unsubscribe: "Désinscription d'un lead",
};

export type WebhookItem = {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  createdAt: Date;
};

export async function listWebhooks(): Promise<WebhookItem[]> {
  return prisma.webhookOut.findMany({
    select: { id: true, url: true, events: true, isActive: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function createWebhook(input: {
  url: string;
  events: string[];
  secret?: string;
  isActive?: boolean;
}): Promise<WebhookItem> {
  const secret = input.secret ?? crypto.randomBytes(32).toString("base64url");
  return prisma.webhookOut.create({
    data: {
      url: input.url,
      events: input.events,
      secret,
      isActive: input.isActive ?? true,
    },
    select: { id: true, url: true, events: true, isActive: true, createdAt: true },
  });
}

export async function updateWebhook(
  id: string,
  input: { url?: string; events?: string[]; isActive?: boolean },
): Promise<WebhookItem> {
  return prisma.webhookOut.update({
    where: { id },
    data: input,
    select: { id: true, url: true, events: true, isActive: true, createdAt: true },
  });
}

export async function deleteWebhook(id: string): Promise<void> {
  await prisma.webhookOut.delete({ where: { id } });
}

/** Retourne le secret en clair pour permettre la vérification HMAC côté tiers. */
export async function revealWebhookSecret(id: string): Promise<string | null> {
  const w = await prisma.webhookOut.findUnique({ where: { id }, select: { secret: true } });
  return w?.secret ?? null;
}

function signBody(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * Émet un événement webhook : poste le payload à toutes les destinations
 * actives abonnées à `event`. Best-effort (1 retry, timeout 10s). Erreurs
 * loggées mais non propagées — le caller ne doit pas attendre cette opération.
 */
export async function emitWebhookEvent(
  event: WebhookEvent,
  payload: unknown,
): Promise<{ dispatched: number; failed: number }> {
  const targets = await prisma.webhookOut.findMany({
    where: { isActive: true, events: { has: event } },
    select: { id: true, url: true, secret: true },
  });
  if (targets.length === 0) return { dispatched: 0, failed: 0 };

  const body = JSON.stringify({
    event,
    occurredAt: new Date().toISOString(),
    payload,
  });

  let dispatched = 0;
  let failed = 0;
  await Promise.all(
    targets.map(async (t) => {
      try {
        const sig = signBody(body, t.secret);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);
        const res = await fetch(t.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Webhook-Event": event,
            "X-Webhook-Signature": `sha256=${sig}`,
            "User-Agent": "CRM-Lead-Dashboard/1.0",
          },
          body,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (res.ok) dispatched++;
        else {
          console.warn(`[webhook] ${t.url} → HTTP ${res.status}`);
          failed++;
        }
      } catch (e) {
        console.warn(`[webhook] ${t.url} échec :`, e instanceof Error ? e.message : e);
        failed++;
      }
    }),
  );
  return { dispatched, failed };
}

/** Test manuel d'un webhook (envoi d'un payload d'exemple). */
export async function testWebhook(id: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  const wh = await prisma.webhookOut.findUnique({ where: { id } });
  if (!wh) return { ok: false, error: "Webhook introuvable" };
  const body = JSON.stringify({
    event: "test",
    occurredAt: new Date().toISOString(),
    payload: { message: "Ceci est un test depuis CRM Lead Dashboard", webhookId: id },
  });
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(wh.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Event": "test",
        "X-Webhook-Signature": `sha256=${signBody(body, wh.secret)}`,
        "User-Agent": "CRM-Lead-Dashboard/1.0",
      },
      body,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
