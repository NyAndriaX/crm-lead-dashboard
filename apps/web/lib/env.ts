import { z } from "zod";

// Validation des variables d'environnement au boot (échec rapide si mal configuré).
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  AUTH_JWT_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(604800),
  PII_ENCRYPTION_KEY: z.string().regex(/^[0-9a-fA-F]{64}$/, "32 bytes hex attendus"),
  EMAIL_HASH_SECRET: z.string().min(8),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_BASE_URL: z.string().url().default("http://localhost:3000"),
  INTERNAL_API_TOKEN: z.string().min(8).optional(),
});

let cached: z.infer<typeof schema> | undefined;

/**
 * Garde-fou production : refuse de démarrer si des secrets d'EXEMPLE
 * (.env.example) sont encore en place. Sans ça, on peut déployer en prod
 * avec `PII_ENCRYPTION_KEY` tout à zéro → la PII des leads n'est pas
 * réellement chiffrée (clé publiquement connue). Échec rapide = sûr.
 */
function assertProductionSecrets(e: z.infer<typeof schema>): void {
  if (e.NODE_ENV !== "production") return;

  // Trappe d'échappement EXPLICITE pour les tests prod-like en local
  // (stack docker-compose sur un poste de dev) où l'on assume des secrets d'exemple jetables.
  // ⚠️ NE JAMAIS définir ALLOW_INSECURE_PROD en vrai déploiement.
  if (process.env.ALLOW_INSECURE_PROD === "true") {
    console.warn(
      "\x1b[33m⚠️  ALLOW_INSECURE_PROD=true — garde-fou secrets DÉSACTIVÉ.\n" +
        "   Acceptable uniquement pour un test prod-like LOCAL. JAMAIS en production.\x1b[0m",
    );
    return;
  }

  const problems: string[] = [];

  if (/^0+$/.test(e.PII_ENCRYPTION_KEY)) {
    problems.push("PII_ENCRYPTION_KEY est la clé d'exemple (zéros) — générez 32 octets aléatoires : openssl rand -hex 32");
  }
  if (/change[-_ ]?me/i.test(e.EMAIL_HASH_SECRET)) {
    problems.push("EMAIL_HASH_SECRET est encore la valeur d'exemple « change-me… ».");
  }
  if (/change[-_ ]?me/i.test(e.AUTH_JWT_SECRET) || e.AUTH_JWT_SECRET.length < 32) {
    problems.push("AUTH_JWT_SECRET faible ou d'exemple (≥ 32 caractères aléatoires requis en prod).");
  }
  if (e.INTERNAL_API_TOKEN && /change[-_ ]?me/i.test(e.INTERNAL_API_TOKEN)) {
    problems.push("INTERNAL_API_TOKEN est encore la valeur d'exemple « change-me… ».");
  }
  if (e.APP_BASE_URL.startsWith("http://") && !e.APP_BASE_URL.includes("localhost")) {
    problems.push("APP_BASE_URL doit être en https:// en production (liens tracking / désinscription).");
  }

  if (problems.length > 0) {
    throw new Error(
      "🚫 Démarrage PRODUCTION bloqué — secrets non sécurisés :\n" +
        problems.map((p) => `  - ${p}`).join("\n") +
        "\nCorrigez ces variables avant de déployer.",
    );
  }
}

export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Configuration d'environnement invalide :\n${issues}`);
    }
    assertProductionSecrets(parsed.data);
    cached = parsed.data;
  }
  return cached;
}
