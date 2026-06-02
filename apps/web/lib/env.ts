import { z } from "zod";

/** Retire espaces et guillemets accidentels (copier-coller .env / Dokploy). */
function trimEnv(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim().replace(/^["']|["']$/g, "");
  return s === "" ? undefined : s;
}

function normalizeNodeEnv(v: unknown): "development" | "test" | "production" {
  const s = trimEnv(v)?.toLowerCase();
  if (s === "dev" || s === "local" || s === "debug") return "development";
  if (s === "prod" || s === "production") return "production";
  if (s === "development" || s === "test") return s;
  if (s) {
    console.warn(`[env] NODE_ENV="${v}" non reconnu → "development" (valeurs : development | test | production)`);
  }
  return "development";
}

function normalizeAppBaseUrl(v: unknown): string {
  let s = trimEnv(v);
  if (!s) return "http://localhost:3000";
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s.replace(/\/+$/, "");
}

function normalizeHexKey(v: unknown, label: string): string {
  const raw = trimEnv(v) ?? "";
  const hex = raw.replace(/[^0-9a-fA-F]/g, "");
  if (hex.length === 64 && /^[0-9a-fA-F]{64}$/.test(hex)) {
    if (hex !== raw) console.warn(`[env] ${label} : caractères non-hex ignorés`);
    return hex;
  }
  return raw;
}

const schema = z.object({
  DATABASE_URL: z.preprocess(trimEnv, z.string().min(1, "DATABASE_URL requis")),
  AUTH_JWT_SECRET: z.preprocess(
    trimEnv,
    z.string().min(8, "AUTH_JWT_SECRET requis (min. 8 caractères)"),
  ),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().catch(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().catch(604800),
  PII_ENCRYPTION_KEY: z.preprocess(
    (v) => normalizeHexKey(v, "PII_ENCRYPTION_KEY"),
    z.string().regex(/^[0-9a-fA-F]{64}$/, "PII_ENCRYPTION_KEY : 64 caractères hex (openssl rand -hex 32)"),
  ),
  EMAIL_HASH_SECRET: z.preprocess(
    trimEnv,
    z.string().min(1, "EMAIL_HASH_SECRET requis"),
  ),
  NODE_ENV: z.preprocess(normalizeNodeEnv, z.enum(["development", "test", "production"])),
  APP_BASE_URL: z.preprocess(normalizeAppBaseUrl, z.string().url()),
  INTERNAL_API_TOKEN: z.preprocess((v) => {
    const s = trimEnv(v);
    return s && s.length >= 8 ? s : undefined;
  }, z.string().min(8).optional()),
});

type EnvConfig = z.infer<typeof schema>;

let cached: EnvConfig | undefined;

function isStrictEnv(): boolean {
  const v = trimEnv(process.env.ENV_STRICT)?.toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/**
 * Garde-fou production : avertissements par défaut ; blocage seulement si ENV_STRICT=true.
 */
function warnProductionSecrets(e: EnvConfig): void {
  if (e.NODE_ENV !== "production") return;

  if (process.env.ALLOW_INSECURE_PROD === "true") {
    console.warn(
      "\x1b[33m⚠️  ALLOW_INSECURE_PROD=true — contrôles secrets prod ignorés.\x1b[0m",
    );
    return;
  }

  const warnings: string[] = [];

  if (/^0+$/.test(e.PII_ENCRYPTION_KEY)) {
    warnings.push("PII_ENCRYPTION_KEY = clé d'exemple (zéros)");
  }
  if (/change[-_ ]?me/i.test(e.EMAIL_HASH_SECRET)) {
    warnings.push("EMAIL_HASH_SECRET = valeur d'exemple");
  }
  if (/change[-_ ]?me/i.test(e.AUTH_JWT_SECRET) || e.AUTH_JWT_SECRET.length < 32) {
    warnings.push("AUTH_JWT_SECRET faible ou d'exemple (recommandé ≥ 32 caractères)");
  }
  if (e.INTERNAL_API_TOKEN && /change[-_ ]?me/i.test(e.INTERNAL_API_TOKEN)) {
    warnings.push("INTERNAL_API_TOKEN = valeur d'exemple");
  }
  if (e.APP_BASE_URL.startsWith("http://") && !e.APP_BASE_URL.includes("localhost")) {
    warnings.push("APP_BASE_URL en http:// (https:// recommandé en production)");
  }

  if (warnings.length === 0) return;

  const block = isStrictEnv();
  const header = block
    ? "🚫 Démarrage PRODUCTION bloqué (ENV_STRICT=true) — secrets non sécurisés :"
    : "⚠️  Configuration production perfectible (définir ENV_STRICT=true pour bloquer au démarrage) :";

  const body = warnings.map((p) => `  - ${p}`).join("\n");

  if (block) {
    throw new Error(`${header}\n${body}`);
  }
  console.warn(`${header}\n${body}`);
}

export function env(): EnvConfig {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n");
      throw new Error(`Configuration d'environnement invalide :\n${issues}`);
    }
    if (parsed.data.AUTH_JWT_SECRET.length < 16 && parsed.data.NODE_ENV !== "production") {
      console.warn("[env] AUTH_JWT_SECRET court (< 16 car.) — acceptable en développement uniquement");
    }
    warnProductionSecrets(parsed.data);
    cached = parsed.data;
  }
  return cached;
}
