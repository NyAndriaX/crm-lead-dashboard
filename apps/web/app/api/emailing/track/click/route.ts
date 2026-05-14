import { NextResponse } from "next/server";
import { prisma, verifyEmailTrackToken } from "@crm/db";

export const dynamic = "force-dynamic";

// GET /api/emailing/track/click?t=… — M-09 clics (redirection)
export async function GET(req: Request) {
  const url = new URL(req.url);
  const t = url.searchParams.get("t");
  const p = t ? verifyEmailTrackToken(t) : null;
  if (!p || p.k !== "click" || !p.u) {
    return NextResponse.redirect(new URL("/", req.url), 302);
  }
  try {
    await prisma.emailEvent.create({
      data: {
        campaignId: p.c,
        leadId: p.l,
        eventType: "CLICK",
        url: p.u,
        meta: { variant: p.v } as object,
      },
    });
  } catch {
    /* ignore */
  }
  return NextResponse.redirect(p.u, 302);
}
