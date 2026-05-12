import { NextResponse } from "next/server";
import { prisma } from "@crm/db";

// Healthcheck consommé par Docker Compose. Vérifie la connexion MongoDB.
export const dynamic = "force-dynamic";

export async function GET() {
  let db: "ok" | "down" = "ok";
  try {
    await prisma.$runCommandRaw({ ping: 1 });
  } catch {
    db = "down";
  }
  const status = db === "ok" ? "ok" : "degraded";
  return NextResponse.json(
    { status, service: "crm-web", db, timestamp: new Date().toISOString() },
    { status: status === "ok" ? 200 : 503 },
  );
}
