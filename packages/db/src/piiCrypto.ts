/**
 * Chiffrement AES-256-GCM (même format que apps/web/lib/crypto.ts).
 * Utilisé par @crm/db pour déchiffrer les secrets utilisateur côté worker.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const hex = process.env.PII_ENCRYPTION_KEY;
  if (!hex) throw new Error("PII_ENCRYPTION_KEY manquant");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("PII_ENCRYPTION_KEY doit faire 32 bytes (64 caractères hex)");
  }
  return key;
}

export function encrypt(plaintext: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

export function decrypt(payload: Buffer): string {
  if (payload.length < IV_LEN + TAG_LEN) throw new Error("Payload chiffré invalide");
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = payload.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export const encryptOrNull = (v: string | null | undefined): Buffer | null =>
  v == null || v === "" ? null : encrypt(v);

export const decryptOrNull = (v: Buffer | Uint8Array | null | undefined): string | null =>
  v == null ? null : decrypt(Buffer.from(v));
