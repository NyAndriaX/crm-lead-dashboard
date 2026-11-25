/**
 * Maintien en éveil (hébergement gratuit qui met le service en veille après 15 min sans requête, ex. Render).
 *
 * Job récurrent « keep-awake » (toutes les 10 min) : pendant la plage horaire configurée, appelle les
 * adresses publiques de KEEP_AWAKE_URLS (application elle-même, scraper). Passant par Internet, ces
 * appels comptent comme des visites et repoussent la veille. Hors plage, rien n'est appelé : les
 * services s'endorment ~15 min plus tard (économie du quota d'heures gratuites).
 *
 * Seul un réveil extérieur reste nécessaire le matin (premier visiteur ou appel planifié, ex. cron-job.org,
 * même si celui-ci reçoit un 503 pendant le réveil).
 *
 *   KEEP_AWAKE_URLS   = "https://app.onrender.com/api/health https://scraper.onrender.com/health"
 *   KEEP_AWAKE_WINDOW = "1-5 07:00-21:00"   (jours ISO 1 = lundi … 7 = dimanche, heures début-fin)
 *   KEEP_AWAKE_TZ     = "Indian/Antananarivo"
 */

export type KeepAwakeWindow = { days: Set<number>; startMin: number; endMin: number };

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function keepAwakeUrls(env = process.env): string[] {
  return (env.KEEP_AWAKE_URLS ?? "").split(/[\s,]+/).map((u) => u.trim()).filter((u) => /^https?:\/\//.test(u));
}

/** « 1-5 07:00-21:00 » → jours 1 à 5, de 07:00 (inclus) à 21:00 (exclu). */
export function parseWindow(spec: string): KeepAwakeWindow {
  const m = spec.trim().match(/^(\d)(?:-(\d))?\s+(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`KEEP_AWAKE_WINDOW invalide : "${spec}" (attendu : "1-5 07:00-21:00")`);
  const d1 = Number(m[1]);
  const d2 = Number(m[2] ?? m[1]);
  const days = new Set<number>();
  for (let d = d1; d <= d2; d++) days.add(d);
  return { days, startMin: Number(m[3]) * 60 + Number(m[4]), endMin: Number(m[5]) * 60 + Number(m[6]) };
}

export function inWindow(now: Date, win: KeepAwakeWindow, timeZone: string): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = WEEKDAYS[get("weekday")] ?? 0;
  const min = Number(get("hour")) * 60 + Number(get("minute"));
  return win.days.has(day) && min >= win.startMin && min < win.endMin;
}

export async function runKeepAwake(): Promise<Record<string, unknown>> {
  const urls = keepAwakeUrls();
  if (urls.length === 0) return { skipped: "KEEP_AWAKE_URLS vide" };
  const tz = process.env.KEEP_AWAKE_TZ?.trim() || "Indian/Antananarivo";
  const win = parseWindow(process.env.KEEP_AWAKE_WINDOW?.trim() || "1-5 07:00-21:00");
  if (!inWindow(new Date(), win, tz)) return { skipped: "hors plage horaire" };

  const results = await Promise.all(
    urls.map(async (url) => {
      const t0 = Date.now();
      try {
        // Jusqu'à 2 min : un service endormi (le scraper) met environ une minute à se réveiller.
        const res = await fetch(url, { signal: AbortSignal.timeout(120_000), headers: { "user-agent": "crm-lead-keep-awake" } });
        return { url, status: res.status, ms: Date.now() - t0 };
      } catch (e) {
        return { url, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 };
      }
    }),
  );
  console.log(`[keep-awake] ${results.map((r) => `${"status" in r ? r.status : "erreur"} ${r.ms}ms ${r.url}`).join(" · ")}`);
  return { pinged: results };
}
