/** Nettoie les valeurs .env (guillemets typographiques Dokploy / Word, espaces). */
export function cleanEnvValue(raw: string | undefined): string {
  if (raw == null) return "";
  return raw
    .trim()
    .replace(/^[\u201c\u201d\u2018\u2019"'`]+|[\u201c\u201d\u2018\u2019"'`]+$/g, "");
}

export function envFlagTrue(raw: string | undefined): boolean {
  const v = cleanEnvValue(raw).toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}
