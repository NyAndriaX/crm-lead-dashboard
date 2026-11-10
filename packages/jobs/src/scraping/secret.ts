/**
 * Proxy de mission (S-06) : l'URL avec identifiants est stockée chiffrée (AES-256-GCM,
 * même format que lib/crypto.ts du web : iv(12) ‖ tag(16) ‖ ciphertext, encodé en base64)
 * dans `ScrapingMission.config.rate.proxyUrlEnc`. Seul le worker la déchiffre, juste avant
 * l'appel au scraper ; elle n'est jamais journalisée.
 */
import * as crypto from "node:crypto";
import type { MissionConfig } from "@crm/db";

function key(): Buffer {
  const hex = process.env.PII_ENCRYPTION_KEY;
  if (!hex) throw new Error("PII_ENCRYPTION_KEY manquant");
  const k = Buffer.from(hex, "hex");
  if (k.length !== 32) throw new Error("PII_ENCRYPTION_KEY doit faire 32 bytes");
  return k;
}

export function encryptSecretB64(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decryptSecretB64(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

/** Proxy effectif de la mission : chiffré → déchiffré ; sinon l'URL en clair (ou null). */
export function resolveMissionProxy(rate: MissionConfig["rate"]): string | null {
  if (rate.proxyUrlEnc) {
    try {
      return decryptSecretB64(rate.proxyUrlEnc);
    } catch {
      throw new Error("Proxy de la mission illisible (clé de chiffrement modifiée ?) — ressaisissez-le.");
    }
  }
  return null;
}
