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

export function env() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Configuration d'environnement invalide :\n${issues}`);
    }
    cached = parsed.data;
  }
  return cached;
}
