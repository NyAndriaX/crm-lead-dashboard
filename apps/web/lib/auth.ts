/**
 * Authentification — CRM-006.
 * JWT custom (jsonwebtoken) + bcrypt (cost 12) + TOTP (otplib).
 *
 * Cookies (HttpOnly, SameSite=Strict) :
 *  - `crm_at` : access token, courte durée (JWT_ACCESS_TTL).
 *  - `crm_rt` : refresh token, longue durée (JWT_REFRESH_TTL) ; porte `tokenVersion`
 *               pour permettre un logout forcé (incrément côté User.tokenVersion).
 *
 * Note d'écart au CDC : l'annexe prévoit l'access token "en mémoire" côté client.
 * Ici on le pose en cookie HttpOnly pour rester compatible SSR / middleware ;
 * à arbitrer si on bascule sur une SPA stricte.
 */
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { authenticator } from "otplib";
import { cookies } from "next/headers";
import type { Role } from "@crm/db";
import { env } from "./env";

const BCRYPT_COST = 12;
export const ACCESS_COOKIE = "crm_at";
export const REFRESH_COOKIE = "crm_rt";

export interface AccessClaims {
  sub: string; // userId
  role: Role;
  name: string;
  email: string;
  typ: "access";
}
export interface RefreshClaims {
  sub: string;
  ver: number; // tokenVersion
  typ: "refresh";
}

// --- mots de passe ---
export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_COST);
export const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);

// --- TOTP ---
export const generateTotpSecret = () => authenticator.generateSecret();
export const totpKeyUri = (secret: string, accountEmail: string) =>
  authenticator.keyuri(accountEmail, "CRM Lead Dashboard", secret);
export const verifyTotp = (token: string, secret: string) => {
  try {
    return authenticator.check(token.replace(/\s/g, ""), secret);
  } catch {
    return false;
  }
};

// --- JWT ---
export function signAccessToken(claims: Omit<AccessClaims, "typ">): string {
  return jwt.sign({ ...claims, typ: "access" }, env().AUTH_JWT_SECRET, {
    expiresIn: env().JWT_ACCESS_TTL,
  });
}
export function signRefreshToken(claims: Omit<RefreshClaims, "typ">): string {
  return jwt.sign({ ...claims, typ: "refresh" }, env().AUTH_JWT_SECRET, {
    expiresIn: env().JWT_REFRESH_TTL,
  });
}
export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    const p = jwt.verify(token, env().AUTH_JWT_SECRET) as AccessClaims;
    return p.typ === "access" ? p : null;
  } catch {
    return null;
  }
}
export function verifyRefreshToken(token: string): RefreshClaims | null {
  try {
    const p = jwt.verify(token, env().AUTH_JWT_SECRET) as RefreshClaims;
    return p.typ === "refresh" ? p : null;
  } catch {
    return null;
  }
}

// --- cookies ---
const secure = () => process.env.NODE_ENV === "production";

export async function setAuthCookies(accessToken: string, refreshToken: string) {
  const jar = await cookies();
  jar.set(ACCESS_COOKIE, accessToken, {
    httpOnly: true, sameSite: "strict", secure: secure(), path: "/",
    maxAge: env().JWT_ACCESS_TTL,
  });
  jar.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true, sameSite: "strict", secure: secure(), path: "/",
    maxAge: env().JWT_REFRESH_TTL,
  });
}
export async function clearAuthCookies() {
  const jar = await cookies();
  jar.delete(ACCESS_COOKIE);
  jar.delete(REFRESH_COOKIE);
}

/** Session courante (à partir du cookie access). Renvoie null si non authentifié. */
export async function getSession(): Promise<AccessClaims | null> {
  const token = (await cookies()).get(ACCESS_COOKIE)?.value;
  return token ? verifyAccessToken(token) : null;
}
