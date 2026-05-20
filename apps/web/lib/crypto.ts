/**
 * Chiffrement des données sensibles — CRM-005 / SEC-03.
 *
 *  - PII des prospects (email, téléphone), credentials SMTP/IMAP, secret TOTP
 *    → AES-256-GCM application-level. Format stocké : iv(12) ‖ tag(16) ‖ ciphertext.
 *  - Recherche / dédoublonnage sur l'email → HMAC-SHA256 (déterministe, indexable).
 *
 * Clés (env, jamais committées ; en prod : Vault / KMS) :
 *  - PII_ENCRYPTION_KEY : 32 bytes en hexadécimal (64 caractères). `openssl rand -hex 32`
 *  - EMAIL_HASH_SECRET  : secret HMAC arbitraire.
 *
 * ⚠️ La perte de PII_ENCRYPTION_KEY = perte irréversible des données chiffrées.
 */
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

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

function getHmacSecret(): string {
  const s = process.env.EMAIL_HASH_SECRET;
  if (!s) throw new Error("EMAIL_HASH_SECRET manquant");
  return s;
}

/** Chiffre une chaîne UTF-8. Renvoie un Buffer `iv ‖ tag ‖ ciphertext`. */
export function encrypt(plaintext: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

/** Déchiffre un Buffer produit par {@link encrypt}. */
export function decrypt(payload: Buffer): string {
  if (payload.length < IV_LEN + TAG_LEN) throw new Error("Payload chiffré invalide");
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = payload.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Variante "nullable" pratique pour les champs Prisma optionnels. */
export const encryptOrNull = (v: string | null | undefined): Buffer | null =>
  v == null || v === "" ? null : encrypt(v);
export const decryptOrNull = (v: Buffer | Uint8Array | null | undefined): string | null =>
  v == null ? null : decrypt(Buffer.from(v));

/** Normalise un email avant hachage / stockage (minuscule, trim). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** HMAC-SHA256 déterministe de l'email normalisé (hex). Utilisé comme clé de recherche / unicité. */
export function emailHash(email: string): string {
  return createHmac("sha256", getHmacSecret()).update(normalizeEmail(email)).digest("hex");
}

/** Comparaison de deux chaînes hex en temps constant (tokens, hash…). */
export function safeEqualHex(a: string, b: string): boolean {
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}
