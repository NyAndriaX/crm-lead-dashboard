/**
 * Liens LinkedIn publiés sur le site de l'entreprise (E-04). LinkedIn n'est jamais interrogé (CGU) :
 * seuls les liens relevés par le scraper sur le site (apps/scraper/app/contacts.py) sont « vérifiés ».
 *  - page entreprise (/company/, /school/, /showcase/) : donnée d'entreprise publique → `enrichment.siteContacts` ;
 *  - profil de personne (/in/) : donnée personnelle → `leads.contactsEnc` (chiffré), jamais en clair.
 */

export type LinkedinKind = "company" | "person";

/** Nature d'une URL LinkedIn, ou null si ce n'est pas un lien de profil / page exploitable. */
export function classifyLinkedinUrl(url: string | null | undefined): LinkedinKind | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (u.protocol !== "https:" || !(host === "linkedin.com" || host.endsWith(".linkedin.com"))) return null;
  const [section, slug] = u.pathname.split("/").filter(Boolean);
  if (!slug) return null;
  if (section === "in" || section === "pub") return "person";
  if (section === "company" || section === "school" || section === "showcase") return "company";
  return null;
}

/** Forme canonique (https://www.linkedin.com/<section>/<slug>) pour comparer et dédoublonner. */
export function canonicalLinkedinUrl(url: string): string | null {
  if (!classifyLinkedinUrl(url)) return null;
  const u = new URL(url.trim());
  const [section, slug] = u.pathname.split("/").filter(Boolean);
  return `https://www.linkedin.com/${section}/${decodeURIComponent(slug ?? "").toLowerCase()}`;
}

/**
 * Liens LinkedIn « vérifiés » d'un lead : ceux trouvés sur son site par le scraper.
 * Sources : `enrichment.siteContacts.linkedinCompany[]` et `socials.linkedin` (en clair),
 * `contacts.linkedinProfiles[]` (contactsEnc déchiffré).
 */
export function siteLinkedinLinks(
  enrichment: unknown,
  privateContacts?: { linkedinProfiles?: unknown } | null,
): { company: string[]; people: string[] } {
  const site = ((enrichment ?? {}) as { siteContacts?: { socials?: Record<string, unknown>; linkedinCompany?: unknown } }).siteContacts;
  const raw: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string") raw.push(v);
    else if (Array.isArray(v)) for (const x of v) if (typeof x === "string") raw.push(x);
  };
  push(site?.linkedinCompany);
  push(site?.socials?.linkedin);
  push(privateContacts?.linkedinProfiles);

  const company: string[] = [];
  const people: string[] = [];
  const seen = new Set<string>();
  for (const url of raw) {
    const key = canonicalLinkedinUrl(url);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    (classifyLinkedinUrl(url) === "company" ? company : people).push(url);
  }
  return { company, people };
}
