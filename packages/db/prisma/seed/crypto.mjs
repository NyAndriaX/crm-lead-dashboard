import { createCipheriv, createHmac, randomBytes } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey() {
  const hex = process.env.PII_ENCRYPTION_KEY;
  if (!hex) throw new Error("PII_ENCRYPTION_KEY manquant (requis pour chiffrer les leads de démo)");
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) throw new Error("PII_ENCRYPTION_KEY doit faire 32 bytes (64 caractères hex)");
  return key;
}

function getHmacSecret() {
  const s = process.env.EMAIL_HASH_SECRET;
  if (!s) throw new Error("EMAIL_HASH_SECRET manquant (requis pour les leads de démo)");
  return s;
}

export function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

export function encrypt(plaintext) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]);
}

export function encryptOrNull(value) {
  return value == null || value === "" ? null : encrypt(value);
}

export function emailHash(email) {
  return createHmac("sha256", getHmacSecret()).update(normalizeEmail(email)).digest("hex");
}
