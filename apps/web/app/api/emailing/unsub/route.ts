import { NextResponse } from "next/server";
import { prisma, verifyEmailTrackToken } from "@crm/db";
import { emitWebhookEvent } from "@/lib/services/webhooks";

export const dynamic = "force-dynamic";

async function processUnsub(t: string | null): Promise<{ ok: boolean; message: string }> {
  if (!t) return { ok: false, message: "Jeton manquant" };
  const p = verifyEmailTrackToken(t);
  if (!p || p.k !== "unsub") return { ok: false, message: "Jeton invalide" };
  const lead = await prisma.lead.findUnique({ where: { id: p.l }, select: { id: true, emailEnc: true, emailHash: true } });
  if (!lead?.emailHash) return { ok: false, message: "Lead introuvable" };
  await prisma.$transaction([
    prisma.emailEvent.create({
      data: {
        campaignId: p.c,
        leadId: p.l,
        eventType: "UNSUBSCRIBE",
        meta: { variant: p.v } as object,
      },
    }),
    prisma.lead.update({
      where: { id: lead.id },
      data: { emailStatus: "UNSUBSCRIBED" },
    }),
    prisma.blacklist.upsert({
      where: { emailHash: lead.emailHash },
      create: { emailHash: lead.emailHash, reason: "unsubscribe" },
      update: { reason: "unsubscribe" },
    }),
  ]);
  // INT-01 : webhook unsubscribe (best-effort, ne bloque pas la réponse).
  void emitWebhookEvent("unsubscribe", { leadId: lead.id, campaignId: p.c });
  return { ok: true, message: "Vous êtes désinscrit. Merci." };
}

/** GET — page minimale RFC 8058 (lien dans l’email). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const t = url.searchParams.get("t");
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"/><title>Désinscription</title></head><body style="font-family:system-ui;padding:2rem">
<p>Pour confirmer la désinscription des emails de cette campagne, cliquez sur le bouton ci-dessous.</p>
<form method="POST" action="${url.pathname}${url.search}">
<button type="submit" style="padding:10px 16px">Me désinscrire</button>
</form></body></html>`;
  if (!t) return new NextResponse("Jeton manquant", { status: 400 });
  return new NextResponse(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

/** POST — List-Unsubscribe=One-Click (RFC 8058) ou formulaire GET. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  let t = url.searchParams.get("t");
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const body = await req.text();
    const params = new URLSearchParams(body);
    t = t ?? params.get("t");
  }
  const r = await processUnsub(t);
  if (r.ok) {
    return new NextResponse(r.message, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  }
  return new NextResponse(r.message, { status: 400 });
}
