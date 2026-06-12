import { z } from "zod";

const trimmed = (min: number, msg: string) =>
  z.string().trim().min(min, msg);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Azure secret *values* are not UUIDs — pasted Secret ID / Client ID triggers false 7000218 errors. */
export function looksLikeAzureGuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

export function validateAzureClientSecret(
  secret: string,
  clientId?: string,
): string | null {
  const s = secret.trim();
  if (!s) return null;
  if (looksLikeAzureGuid(s)) {
    return "Cette valeur ressemble à un ID Azure (UUID), pas à la Valeur du secret. Dans Azure Portal → Certificats et secrets, copiez la colonne « Valeur » affichée une seule fois à la création.";
  }
  if (clientId && s === clientId.trim()) {
    return "Le Client Secret ne peut pas être identique au Client ID (Application ID).";
  }
  return null;
}

export const msOAuthClientSchema = z.object({
  tenantId: trimmed(1, "Tenant ID requis"),
  clientId: trimmed(1, "Client ID requis"),
});

export const msOAuthCredsSchema = msOAuthClientSchema.extend({
  clientSecret: z.string().trim().optional(),
});

export function parseMsOAuthCreds(input: z.infer<typeof msOAuthCredsSchema>) {
  return {
    tenantId: input.tenantId.trim(),
    clientId: input.clientId.trim(),
    clientSecret: (input.clientSecret ?? "").trim(),
  };
}
