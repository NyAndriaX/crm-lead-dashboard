import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware d'authentification — CRM-007.
 *
 * Garde "premier rideau" : présence du cookie d'access token.
 *  - pages protégées sans cookie → redirection /login
 *  - API protégée sans cookie    → 401 JSON
 *
 * La vérification cryptographique du JWT + le contrôle RBAC fin se font côté
 * serveur dans chaque Route Handler (`requireSession` / `requirePermission`),
 * car `jsonwebtoken` n'est pas compatible avec le runtime Edge du middleware.
 */
const ACCESS_COOKIE = "crm_at";

// Routes publiques (préfixes).
const PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/users/accept-invite",
  "/api/organization/branding",
  "/api/health",
  "/api/emailing/track/",
  "/api/emailing/unsub",
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** En-têtes anti-cache sur toutes les réponses /api (filet de sécurité côté edge). */
function withApiNoStore(res: NextResponse): NextResponse {
  res.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

/** Journalise chaque requête en NODE_ENV=development (image runtime Dokploy / debug). */
function logRequest(req: NextRequest) {
  if (process.env.NODE_ENV !== "development") return;
  const { pathname, search } = req.nextUrl;
  console.log(`[http] ${req.method} ${pathname}${search}`);
}

export function middleware(req: NextRequest) {
  logRequest(req);
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  if (isPublic(pathname)) {
    return isApi ? withApiNoStore(NextResponse.next()) : NextResponse.next();
  }

  const hasToken = Boolean(req.cookies.get(ACCESS_COOKIE)?.value);
  if (hasToken) {
    return isApi ? withApiNoStore(NextResponse.next()) : NextResponse.next();
  }

  if (isApi) {
    return withApiNoStore(
      NextResponse.json({ error: "unauthenticated", message: "Authentification requise" }, { status: 401 }),
    );
  }
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Tout sauf les assets statiques Next et le favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
