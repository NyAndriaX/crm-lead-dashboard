/** Libellés unifiés pour les comptes SMTP / IMAP (classiques + Microsoft 365 OAuth). */

export type SmtpOptionLike = {
  id: string;
  label: string;
  fromEmail?: string | null;
  oauthProvider?: string | null;
  oauthMailSender?: string | null;
  host?: string;
};

export type ImapOptionLike = {
  id: string;
  label: string;
  oauthProvider?: string | null;
  oauthMailbox?: string | null;
  host?: string;
};

export function formatSmtpOptionLabel(c: SmtpOptionLike): string {
  const isMicrosoft = c.oauthProvider === "microsoft";
  const email = c.oauthMailSender ?? c.fromEmail;
  const kind = isMicrosoft ? "Microsoft 365" : "SMTP";
  const parts = [c.label, `(${kind})`];
  if (email) parts.push(`<${email}>`);
  return parts.join(" ");
}

export function formatImapOptionLabel(c: ImapOptionLike): string {
  const isMicrosoft = c.oauthProvider === "microsoft";
  const email = c.oauthMailbox;
  const kind = isMicrosoft ? "Microsoft 365" : "IMAP";
  const parts = [c.label, `(${kind})`];
  if (email) parts.push(`<${email}>`);
  return parts.join(" ");
}

export function smtpSelectOptions<T extends SmtpOptionLike>(configs: T[]) {
  return configs.map((c) => ({ value: c.id, label: formatSmtpOptionLabel(c) }));
}
