import { NextResponse } from "next/server";
import { prisma, verifyEmailTrackToken } from "@crm/db";

export const dynamic = "force-dynamic";

/** Pixel 1×1 GIF transparent (43 octets). */
const PIXEL_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

// GET /api/emailing/track/open?t=… — pixel 1×1, enregistrement ouverture
export async function GET(req: Request) {
  const url = new URL(req.url);
  const t = url.searchParams.get("t");
  if (!t) return new NextResponse(PIXEL_GIF, { status: 400, headers: { "content-type": "image/gif" } });
  const p = verifyEmailTrackToken(t);
  if (!p || p.k !== "open") return new NextResponse(PIXEL_GIF, { headers: { "content-type": "image/gif" } });
  try {
    await prisma.emailEvent.create({
      data: {
        campaignId: p.c,
        leadId: p.l,
        eventType: "OPEN",
        meta: { variant: p.v } as object,
      },
    });
  } catch {
    /* ignore duplicate / erreurs DB */
  }
  return new NextResponse(PIXEL_GIF, {
    headers: {
      "content-type": "image/gif",
      "cache-control": "no-store, no-cache, must-revalidate, private",
    },
  });
}
