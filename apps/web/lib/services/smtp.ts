/**
 * Service SMTP : configuration chiffrée et validation.
 */
import dns from "dns/promises";
import nodemailer from "nodemailer";
import { prisma } from "@crm/db";
import { encryptOrNull } from "@/lib/crypto";

export interface SmtpConfigInput {
  label: string;
  host: string;
  port: number;
  login: string;
  password: string;
  fromName?: string | null;
  fromEmail?: string | null;
  dailyLimit?: number;
  isActive?: boolean;
}

export interface SmtpConfigUpdateInput {
  label?: string;
  host?: string;
  port?: number;
  login?: string;
  password?: string | null;
  fromName?: string | null;
  fromEmail?: string | null;
  dailyLimit?: number;
  isActive?: boolean;
}

export async function listSmtpConfigs() {
  return prisma.smtpConfig.findMany({
    select: {
      id: true,
      label: true,
      host: true,
      port: true,
      fromName: true,
      fromEmail: true,
      dailyLimit: true,
      isActive: true,
      createdAt: true,
      oauthProvider: true,
      oauthMailSender: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getSmtpConfig(id: string) {
  return prisma.smtpConfig.findUnique({
    where: { id },
    select: {
      id: true,
      label: true,
      host: true,
      port: true,
      fromName: true,
      fromEmail: true,
      dailyLimit: true,
      isActive: true,
      createdAt: true,
    },
  });
}

export async function createSmtpConfig(input: SmtpConfigInput) {
  return prisma.smtpConfig.create({
    data: {
      label: input.label,
      host: input.host,
      port: input.port,
      loginEnc: encryptOrNull(input.login)!,
      passwordEnc: encryptOrNull(input.password)!,
      fromName: input.fromName ?? null,
      fromEmail: input.fromEmail ?? null,
      dailyLimit: input.dailyLimit ?? 200,
      isActive: input.isActive ?? true,
    },
    select: {
      id: true,
      label: true,
      host: true,
      port: true,
      fromName: true,
      fromEmail: true,
      dailyLimit: true,
      isActive: true,
      createdAt: true,
    },
  });
}

export async function updateSmtpConfig(id: string, input: SmtpConfigUpdateInput) {
  const data: Record<string, unknown> = {
    ...(input.label !== undefined ? { label: input.label } : {}),
    ...(input.host !== undefined ? { host: input.host } : {}),
    ...(input.port !== undefined ? { port: input.port } : {}),
    ...(input.fromName !== undefined ? { fromName: input.fromName } : {}),
    ...(input.fromEmail !== undefined ? { fromEmail: input.fromEmail } : {}),
    ...(input.dailyLimit !== undefined ? { dailyLimit: input.dailyLimit } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
  };
  if (input.login !== undefined) {
    data.loginEnc = encryptOrNull(input.login);
  }
  if (input.password !== undefined) {
    if (input.password === null || input.password === "") {
      // leave existing password unchanged
    } else {
      data.passwordEnc = encryptOrNull(input.password);
    }
  }
  return prisma.smtpConfig.update({
    where: { id },
    data,
    select: {
      id: true,
      label: true,
      host: true,
      port: true,
      fromName: true,
      fromEmail: true,
      dailyLimit: true,
      isActive: true,
      createdAt: true,
    },
  });
}

export async function deleteSmtpConfig(id: string) {
  await prisma.smtpConfig.delete({ where: { id } });
}

export async function checkSmtpDnsRecords(input: {
  domain: string;
  dkimSelector?: string;
}) {
  const normalizeRecords = (records: string[][]): string[] => records.map((chunks) => chunks.join(""));

  const resolveTxt = async (name: string) => {
    try {
      const records = await dns.resolveTxt(name);
      return normalizeRecords(records);
    } catch (e: unknown) {
      const error = e as { code?: string; message?: string };
      if (error.code === "ENOTFOUND" || error.code === "ENODATA" || error.code === "ENOTIMP" || error.code === "ETIMEOUT") {
        return [];
      }
      throw e;
    }
  };

  const domain = input.domain.trim();
  const selector = input.dkimSelector?.trim() || "";
  const spfRecords = await resolveTxt(domain);
  const spfRecord = spfRecords.find((record) => /(^|\s)v=spf1/i.test(record));
  const dmarcRecords = await resolveTxt(`_dmarc.${domain}`);
  const dmarcRecord = dmarcRecords.find((record) => /(^|\s)v=DMARC1/i.test(record));
  const dkim = selector ? await resolveTxt(`${selector}._domainkey.${domain}`) : [];
  const dkimRecord = selector ? dkim.find((record) => /(^|\s)v=DKIM1/i.test(record)) : null;

  return {
    domain,
    selector: selector || undefined,
    spf: {
      found: Boolean(spfRecord),
      record: spfRecord ?? undefined,
      error: spfRecord ? undefined : "Aucun enregistrement SPF trouvé.",
    },
    dkim: {
      found: Boolean(dkimRecord),
      record: dkimRecord ?? undefined,
      error: selector ? (dkimRecord ? undefined : "Aucun enregistrement DKIM trouvé.") : "Sélecteur DKIM non renseigné.",
    },
    dmarc: {
      found: Boolean(dmarcRecord),
      record: dmarcRecord ?? undefined,
      error: dmarcRecord ? undefined : "Aucun enregistrement DMARC trouvé.",
    },
  };
}

export async function testSmtpConnection(input: {
  host: string;
  port: number;
  login: string;
  password: string;
}) {
  const secure = input.port === 465;
  const transporter = nodemailer.createTransport({
    host: input.host,
    port: input.port,
    secure,
    auth: {
      user: input.login,
      pass: input.password,
    },
    tls: { rejectUnauthorized: false },
  });
  await transporter.verify();
  return { ok: true, message: "Connexion SMTP réussie" };
}
