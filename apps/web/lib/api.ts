/**
 * Helpers pour les Route Handlers : réponses JSON normalisées, validation Zod,
 * garde d'authentification + RBAC, gestion d'erreurs centralisée.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@crm/db";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { getSession, type AccessClaims } from "./auth";
import { can, type Permission, ensureRbacLoaded } from "./rbac";

/** Erreurs Prisma / config fréquentes → message exploitable côté client (sans fuite de secrets). */
function tryMapInfrastructureError(e: unknown): Response | null {
  if (e instanceof Prisma.PrismaClientInitializationError) {
    return NextResponse.json(
      {
        error: "database_unavailable",
        message:
          "Impossible de joindre la base de données. Vérifiez que le serveur SQL est démarré et que DATABASE_URL est correct (hôte accessible depuis l'application, port, identifiants).",
      },
      { status: 503 },
    );
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (["P1001", "P1002", "P1003", "P1017"].includes(e.code)) {
      return NextResponse.json(
        {
          error: "database_unavailable",
          message:
            "La base de données est injoignable ou la base n'existe pas. Vérifiez DATABASE_URL et l'état du serveur SQL.",
        },
        { status: 503 },
      );
    }
  }
  if (e instanceof Prisma.PrismaClientUnknownRequestError || e instanceof Prisma.PrismaClientRustPanicError) {
    return NextResponse.json(
      {
        error: "database_error",
        message: "Erreur du moteur de base de données. Réessayez dans quelques instants ou contactez l'administrateur.",
      },
      { status: 503 },
    );
  }
  if (e instanceof Prisma.PrismaClientValidationError) {
    return NextResponse.json(
      { error: "database_validation_error", message: "Requête base de données invalide." },
      { status: 400 },
    );
  }
  if (e instanceof Error) {
    if (e.message.startsWith("Configuration d'environnement invalide")) {
      return NextResponse.json(
        {
          error: "misconfigured",
          message:
            "Le serveur est mal configuré : variables d'environnement manquantes ou invalides. Consultez les logs serveur pour le détail.",
        },
        { status: 503 },
      );
    }
    if (e.message.includes("Démarrage PRODUCTION bloqué")) {
      return NextResponse.json(
        {
          error: "misconfigured",
          message:
            "Démarrage refusé : secrets d'exemple ou non sécurisés détectés en production. Corrigez la configuration puis redémarrez.",
        },
        { status: 503 },
      );
    }
  }
  return null;
}

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

/** Politique globale : aucune réponse API ne doit être mise en cache navigateur / proxy. */
export const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, no-cache, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

function withNoStore(init?: ResponseInit): ResponseInit {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) {
    headers.set(key, value);
  }
  return { ...init, headers };
}

/** Applique les en-têtes anti-cache à toute Response (y compris exports, fichiers). */
export function applyNoStore(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [key, value] of Object.entries(NO_STORE_HEADERS)) {
    headers.set(key, value);
  }
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

export const json = <T>(data: T, init?: ResponseInit) => NextResponse.json(data, withNoStore(init));
export const created = <T>(data: T, init?: ResponseInit) =>
  NextResponse.json(data, withNoStore({ ...init, status: 201 }));
export const notFound = () => NextResponse.json({ message: "Not found" }, withNoStore({ status: 404 }));
export const noContent = () =>
  new NextResponse(null, withNoStore({ status: 204 }));

/** @deprecated Alias de `json` — le cache HTTP API est désactivé partout. */
export const jsonCached = json;

/** Enveloppe un handler : capture ApiError / ZodError et renvoie une réponse propre. */
export function handler<Ctx = unknown>(
  fn: (req: Request, ctx: Ctx) => Promise<Response> | Response,
) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      return applyNoStore(await fn(req, ctx));
    } catch (e) {
      if (e instanceof ApiError) {
        return applyNoStore(
          NextResponse.json(
            { error: e.code, message: e.message, details: e.details ?? undefined },
            withNoStore({ status: e.status }),
          ),
        );
      }
      if (e instanceof ZodError) {
        return applyNoStore(
          NextResponse.json(
            { error: "validation_error", message: "Données invalides", details: e.flatten() },
            withNoStore({ status: 422 }),
          ),
        );
      }
      const infra = tryMapInfrastructureError(e);
      if (infra) return applyNoStore(infra);

      console.error("[api] unhandled error:", e);
      const isDev = process.env.NODE_ENV === "development";
      const verbose =
        process.env.VERBOSE_INTERNAL_API_ERRORS === "true" || process.env.VERBOSE_INTERNAL_API_ERRORS === "1";
      const err = e instanceof Error ? e : null;
      const exposeMessage = (isDev || verbose) && Boolean(err?.message);
      const message = exposeMessage
        ? err!.message
        : "Une erreur inattendue s'est produite. Si le problème persiste, contactez l'administrateur.";
      return applyNoStore(
        NextResponse.json(
          {
            error: "internal_error",
            message,
            ...((isDev || verbose) && err?.stack ? { details: { stack: err.stack } } : {}),
          },
          withNoStore({ status: 500 }),
        ),
      );
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
  await ensureRbacLoaded();
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
