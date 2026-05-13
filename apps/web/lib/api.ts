/**
 * Helpers pour les Route Handlers : réponses JSON normalisées, validation Zod,
 * garde d'authentification + RBAC, gestion d'erreurs centralisée.
 */
import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { getSession, type AccessClaims } from "./auth";
import { can, type Permission } from "./rbac";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error",
    public details?: unknown,
  ) {
    super(message);
  }
}

export const json = <T>(data: T, init?: ResponseInit) => NextResponse.json(data, init);
export const created = <T>(data: T) => NextResponse.json(data, { status: 201 });
export const notFound = () => NextResponse.json({ message: "Not found" }, { status: 404 });
export const noContent = () => new NextResponse(null, { status: 204 });

/** Enveloppe un handler : capture ApiError / ZodError et renvoie une réponse propre. */
export function handler<Ctx = unknown>(
  fn: (req: Request, ctx: Ctx) => Promise<Response> | Response,
) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof ApiError) {
        return NextResponse.json(
          { error: e.code, message: e.message, details: e.details ?? undefined },
          { status: e.status },
        );
      }
      if (e instanceof ZodError) {
        return NextResponse.json(
          { error: "validation_error", message: "Données invalides", details: e.flatten() },
          { status: 422 },
        );
      }
      console.error("[api] unhandled error:", e);
      return NextResponse.json({ error: "internal_error", message: "Erreur interne" }, { status: 500 });
    }
  };
}

/** Parse + valide le body JSON. Lève une ZodError si invalide. */
export async function parseBody<S extends ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "Body JSON invalide", "bad_json");
  }
  return schema.parse(raw);
}

/** Valide les query params (URLSearchParams → objet). */
export function parseQuery<S extends ZodTypeAny>(req: Request, schema: S): z.infer<S> {
  const url = new URL(req.url);
  return schema.parse(Object.fromEntries(url.searchParams.entries()));
}

/** Exige une session valide ; lève 401 sinon. */
export async function requireSession(): Promise<AccessClaims> {
  const s = await getSession();
  if (!s) throw new ApiError(401, "Authentification requise", "unauthenticated");
  return s;
}

/** Exige une session + une permission RBAC ; lève 401 / 403. */
export async function requirePermission(permission: Permission): Promise<AccessClaims> {
  const s = await requireSession();
  if (!can(s.role, permission)) {
    throw new ApiError(403, `Permission manquante : ${permission}`, "forbidden");
  }
  return s;
}

/** Exige un des rôles fournis ; lève 401 / 403. */
export async function requireRole(...roles: AccessClaims["role"][]): Promise<AccessClaims> {
  const s = await requireSession();
  if (!roles.includes(s.role)) throw new ApiError(403, "Rôle non autorisé", "forbidden");
  return s;
}
