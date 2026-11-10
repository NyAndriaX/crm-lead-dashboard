/**
 * AN-05 — Transport SMTP de l'envoi planifié des rapports.
 *
 * Ordre de résolution :
 *  1. le compte choisi sur le plan d'envoi (`reportSchedules.smtpConfigId`, identifiants chiffrés en base) ;
 *  2. le SMTP de secours du .env (SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM_*) ;
 *  3. le premier compte SMTP actif (le moins sollicité aujourd'hui).
 */
import * as crypto from "node:crypto";
import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@crm/db";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function decrypt(payload: Buffer): string {
  const hex = process.env.PII_ENCRYPTION_KEY;
  if (!hex) throw new Error("PII_ENCRYPTION_KEY manquant");
  const key = Buffer.from(hex, "hex");
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = payload.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export type ReportTransport = { transporter: Transporter; from: string; via: string; smtpConfigId: string | null };

async function fromSmtpConfig(where: { id: string } | { isActive: true }): Promise<ReportTransport | null> {
  const row = "id" in where
    ? await prisma.smtpConfig.findUnique({ where })
    : await prisma.smtpConfig.findFirst({ where, orderBy: { sentToday: "asc" } });
  if (!row) return null;
  const login = decrypt(Buffer.from(row.loginEnc));
  const pass = decrypt(Buffer.from(row.passwordEnc));
  return {
    transporter: nodemailer.createTransport({
      host: row.host, port: row.port, secure: row.port === 465, auth: { user: login, pass }, tls: { rejectUnauthorized: false },
    }),
    from: `"${row.fromName ?? "CRM Lead"}" <${row.fromEmail ?? login}>`,
    via: `compte « ${row.label} »`,
    smtpConfigId: row.id,
  };
}

function fromEnv(): ReportTransport | null {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT ?? 587) || 587;
  return {
    transporter: nodemailer.createTransport({
      host, port, secure: port === 465, ...(user && pass ? { auth: { user, pass } } : {}), tls: { rejectUnauthorized: false },
    }),
    from: `"${process.env.SMTP_FROM_NAME?.trim() || "CRM Lead"}" <${process.env.SMTP_FROM_EMAIL?.trim() || user || "noreply@localhost"}>`,
    via: `SMTP de secours (${host}:${port})`,
    smtpConfigId: null,
  };
}

export async function resolveReportTransport(smtpConfigId: string | null): Promise<ReportTransport> {
  if (smtpConfigId) {
    const t = await fromSmtpConfig({ id: smtpConfigId });
    if (t) return t;
  }
  const env = fromEnv();
  if (env) return env;
  const any = await fromSmtpConfig({ isActive: true });
  if (any) return any;
  throw new Error("Aucun SMTP disponible : choisissez un compte d'envoi ou renseignez SMTP_HOST dans le .env (SMTP de secours).");
}
