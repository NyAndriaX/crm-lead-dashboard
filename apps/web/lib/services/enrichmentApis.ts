/**
 * Clients HTTP des fournisseurs d'enrichissement (E-01 / E-03 / INT-03). Fonctions pures : la clé et
 * `fetch` sont passés en paramètre (tests unitaires avec un `fetch` simulé, aucun appel réel).
 * Chaque client renvoie `null` quand le fournisseur ne trouve rien ou échoue : l'engine passe alors
 * au fournisseur suivant (lib/services/enrichment.ts).
 */

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type ApiEmailHit = { email: string; confidence: number; qualification?: string | null };

export type ApiCompanyHit = {
  legalName: string | null;
  siren: string | null;
  nafCode: string | null;
  nafLabel?: string | null;
  employeesRange?: string | null;
  foundedYear: number | null;
  address?: string | null;
  active?: boolean | null;
};

// ── Hunter.io — Email Finder ────────────────────────────────────────────────

export async function hunterFindEmail(
  apiKey: string,
  args: { domain: string; firstName: string; lastName: string },
  fetchImpl: FetchLike = fetch,
): Promise<ApiEmailHit | null> {
  const url = `https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(args.domain)}&first_name=${encodeURIComponent(args.firstName)}&last_name=${encodeURIComponent(args.lastName)}&api_key=${encodeURIComponent(apiKey)}`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { email?: string; score?: number } };
    return j.data?.email ? { email: j.data.email, confidence: j.data.score ?? 70 } : null;
  } catch {
    return null;
  }
}

// ── Dropcontact — enrichissement asynchrone (POST puis lecture du résultat) ─

const DROPCONTACT_URL = "https://api.dropcontact.com/v1/enrich/all";

/** Confiance déduite de la qualification Dropcontact (« nominative@pro », « catch_all@pro »…). */
export function dropcontactConfidence(qualification: string | null | undefined): number {
  const [local, domain] = (qualification ?? "").split("@");
  if (local === "invalid" || domain === "invalid") return 0;
  const base = local === "nominative" ? 95 : local === "catch_all" ? 60 : local === "generic" ? 50 : 40;
  return domain === "perso" ? Math.min(base, 50) : base;
}

export async function dropcontactFindEmail(
  apiKey: string,
  args: { firstName: string | null; lastName: string | null; company: string | null; website: string | null },
  opts: { fetchImpl?: FetchLike; pollMs?: number; maxWaitMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<ApiEmailHit | null> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const pollMs = opts.pollMs ?? 3_000;
  const maxWaitMs = opts.maxWaitMs ?? 15_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  // Combinaison minimale exigée : prénom + nom + entreprise (ou site).
  if (!args.firstName || !args.lastName || !(args.company || args.website)) return null;
  const headers = { "X-Access-Token": apiKey, "Content-Type": "application/json" };
  try {
    const contact: Record<string, string> = { first_name: args.firstName, last_name: args.lastName };
    if (args.company) contact.company = args.company;
    if (args.website) contact.website = args.website;
    const post = await fetchImpl(DROPCONTACT_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ data: [contact], siren: false, language: "fr" }),
    });
    if (!post.ok) return null;
    const { request_id: requestId, success } = (await post.json()) as { request_id?: string; success?: boolean };
    if (!requestId || success === false) return null;

    // Le résultat n'est prêt qu'après quelques secondes : lecture périodique, puis résultat partiel forcé.
    type Result = { success?: boolean; data?: { email?: { email?: string; qualification?: string }[] }[] };
    let result: Result | null = null;
    for (let waited = 0; waited < maxWaitMs; waited += pollMs) {
      await sleep(pollMs);
      const res = await fetchImpl(`${DROPCONTACT_URL}/${encodeURIComponent(requestId)}`, { headers });
      if (!res.ok) return null;
      const j = (await res.json()) as Result;
      if (j.success) { result = j; break; }
    }
    if (!result) {
      const res = await fetchImpl(`${DROPCONTACT_URL}/${encodeURIComponent(requestId)}?forceResults=true`, { headers });
      result = res.ok ? ((await res.json()) as Result) : null;
    }
    const emails = (result?.data?.[0]?.email ?? []).filter((e) => !!e.email);
    const best = emails.find((e) => e.qualification?.startsWith("nominative")) ?? emails[0];
    if (!best?.email || dropcontactConfidence(best.qualification) === 0) return null;
    return { email: best.email, confidence: dropcontactConfidence(best.qualification), qualification: best.qualification ?? null };
  } catch {
    return null;
  }
}

// ── Pappers — recherche d'entreprise ───────────────────────────────────────

export async function pappersSearch(
  apiKey: string,
  args: { company: string; siren?: string | null },
  fetchImpl: FetchLike = fetch,
): Promise<ApiCompanyHit | null> {
  const q = args.siren ?? args.company;
  const url = `https://api.pappers.fr/v2/recherche?q=${encodeURIComponent(q)}&api_token=${encodeURIComponent(apiKey)}&par_page=1`;
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return null;
    const j = (await res.json()) as {
      resultats?: Array<{ nom_entreprise?: string; siren?: string; code_naf?: string; libelle_code_naf?: string; date_creation?: string }>;
    };
    const r = j.resultats?.[0];
    if (!r) return null;
    return {
      legalName: r.nom_entreprise ?? null,
      siren: r.siren ?? null,
      nafCode: r.code_naf ?? null,
      nafLabel: r.libelle_code_naf ?? null,
      foundedYear: r.date_creation ? Number(r.date_creation.slice(0, 4)) || null : null,
    };
  } catch {
    return null;
  }
}

// ── API Recherche d'entreprises (État, gratuite, sans clé) ─────────────────

/** Tranches d'effectif salarié INSEE (champ `tranche_effectif_salarie`). */
const EFFECTIF_TRANCHES: Record<string, string> = {
  "00": "0 salarié", "01": "1 à 2 salariés", "02": "3 à 5 salariés", "03": "6 à 9 salariés",
  "11": "10 à 19 salariés", "12": "20 à 49 salariés", "21": "50 à 99 salariés", "22": "100 à 199 salariés",
  "31": "200 à 249 salariés", "32": "250 à 499 salariés", "41": "500 à 999 salariés", "42": "1 000 à 1 999 salariés",
  "51": "2 000 à 4 999 salariés", "52": "5 000 à 9 999 salariés", "53": "10 000 salariés et plus",
};

export async function rechercheEntreprisesSearch(
  args: { company: string; siren?: string | null },
  fetchImpl: FetchLike = fetch,
): Promise<ApiCompanyHit | null> {
  const q = args.siren ?? args.company;
  const url = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(q)}&per_page=1&page=1`;
  try {
    const res = await fetchImpl(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const j = (await res.json()) as {
      results?: Array<{
        siren?: string; nom_complet?: string; nom_raison_sociale?: string | null; activite_principale?: string | null;
        tranche_effectif_salarie?: string | null; date_creation?: string | null; etat_administratif?: string | null;
        siege?: { adresse?: string | null } | null;
      }>;
    };
    const r = j.results?.[0];
    if (!r) return null;
    return {
      legalName: r.nom_raison_sociale ?? r.nom_complet ?? null,
      siren: r.siren ?? null,
      nafCode: r.activite_principale ?? null,
      employeesRange: r.tranche_effectif_salarie ? EFFECTIF_TRANCHES[r.tranche_effectif_salarie] ?? null : null,
      foundedYear: r.date_creation ? Number(r.date_creation.slice(0, 4)) || null : null,
      address: r.siege?.adresse ?? null,
      active: r.etat_administratif ? r.etat_administratif === "A" : null,
    };
  } catch {
    return null;
  }
}
