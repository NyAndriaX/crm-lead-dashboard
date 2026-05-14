import { createHmac, timingSafeEqual } from "node:crypto";

export type EmailTrackKind = "open" | "click" | "unsub";

export type EmailTrackPayload = {
  k: EmailTrackKind;
  c: string;
  l: string;
  v: string;
  /** URL cible (clics uniquement). */
  u?: string;
};

function secret(): string {
  const s = process.env.EMAIL_HASH_SECRET;
  if (!s || s.length < 8) throw new Error("EMAIL_HASH_SECRET manquant ou trop court");
  return s;
}

function signBlob(blob: string): string {
  return createHmac("sha256", secret()).update(blob).digest("hex");
}

/** Jeton URL-safe (HMAC) — pas de ligne en base requise. */
export function signEmailTrackToken(p: EmailTrackPayload): string {
  const blob =
    p.k === "click" && p.u != null && p.u !== ""
      ? `${p.k}|${p.c}|${p.l}|${p.v}|${p.u}`
      : `${p.k}|${p.c}|${p.l}|${p.v}`;
  const sig = signBlob(blob);
  return Buffer.from(JSON.stringify({ ...p, s: sig }), "utf8").toString("base64url");
}

export function verifyEmailTrackToken(raw: string): EmailTrackPayload | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const o = JSON.parse(json) as EmailTrackPayload & { s?: string };
    if (!o || (o.k !== "open" && o.k !== "click" && o.k !== "unsub")) return null;
    if (!o.c || !o.l || !o.v || !o.s) return null;
    if (o.k === "click" && (!o.u || o.u === "")) return null;
    const blob =
      o.k === "click" && o.u != null && o.u !== ""
        ? `${o.k}|${o.c}|${o.l}|${o.v}|${o.u}`
        : `${o.k}|${o.c}|${o.l}|${o.v}`;
    const expected = signBlob(blob);
    let a: Buffer;
    let b: Buffer;
    try {
      a = Buffer.from(expected, "hex");
      b = Buffer.from(o.s, "hex");
    } catch {
      return null;
    }
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return { k: o.k, c: o.c, l: o.l, v: o.v, ...(o.k === "click" && o.u ? { u: o.u } : {}) };
  } catch {
    return null;
  }
}
