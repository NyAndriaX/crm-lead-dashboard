import { z } from "zod";

/** Sites sectoriels d'une mission (S-05) : pages d'annuaires de branche, listes de membres… */
export const sectorSitesSchema = z
  .array(
    z
      .string()
      .trim()
      .max(500)
      .url("URL invalide")
      .refine((u) => /^https?:\/\//i.test(u), "URL http(s) attendue"),
  )
  .max(10, "10 sites sectoriels au plus")
  .optional();

const PROXY_RE = /^(https?|socks5|socks4):\/\/[^\s/]+$/i;

/**
 * Débit de la mission (S-06). `proxyUrl` : URL complète (http, https, socks5), éventuellement
 * avec identifiants (chiffrée au stockage) ; le libellé masqué renvoyé par l'API conserve le proxy existant.
 */
export const missionRateSchema = z
  .object({
    delayMs: z.number().int().min(0).max(60_000),
    retries: z.number().int().min(0).max(5),
    rotateUserAgent: z.boolean(),
    proxyUrl: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || PROXY_RE.test(v.replace(/\/$/, "")), "Proxy attendu : http(s)://[utilisateur:motdepasse@]hôte:port")
      .nullable()
      .optional(),
  })
  .partial()
  .optional();
