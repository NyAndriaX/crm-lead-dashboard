import { z } from "zod";

const trimmed = (min: number, msg: string) =>
  z.string().trim().min(min, msg);

export const msOAuthCredsSchema = z.object({
  tenantId: trimmed(1, "Tenant ID requis"),
  clientId: trimmed(1, "Client ID requis"),
  clientSecret: trimmed(8, "Client Secret requis — copiez la Valeur du secret Azure (pas l'ID du secret)"),
});

export function parseMsOAuthCreds(input: z.infer<typeof msOAuthCredsSchema>) {
  return {
    tenantId: input.tenantId.trim(),
    clientId: input.clientId.trim(),
    clientSecret: input.clientSecret.trim(),
  };
}
