/**
 * M-13 — Comparatif des variantes d'un test A/B de campagne (fonctions pures, testées).
 *
 * Attribution : chaque lead reçoit UNE variante (répartition déterministe de campaignSend.ts) ; la
 * variante est lue sur son événement SENT (`meta.variant`). Ouvertures, clics, réponses, bounces et
 * désinscriptions sont comptés en contacts uniques et rattachés à la variante reçue par le lead.
 *
 * Règle de la variante gagnante (simple, documentée, affichée dans l'interface) :
 *  1. chaque variante doit avoir au moins `minSentPerVariant` envois (30 par défaut) ;
 *  2. on compare d'abord le TAUX DE RÉPONSE (objectif commercial), puis à défaut le TAUX D'OUVERTURE ;
 *  3. l'écart est jugé significatif par un test z de deux proportions au seuil de 95 % (|z| ≥ 1,96)
 *     ET un écart absolu d'au moins `minGapPts` points (2 points pour la réponse, 5 pour l'ouverture).
 * Sinon : pas de gagnant (« écart non significatif » ou « échantillon insuffisant »).
 */

export type AbVariant = "A" | "B";

export type AbEvent = { leadId: string | null; eventType: string; variant?: string | null };

export type AbVariantStats = {
  variant: AbVariant;
  sent: number;
  opens: number;
  clicks: number;
  replies: number;
  bounces: number;
  unsubscribes: number;
  openRate: number | null;
  clickRate: number | null;
  replyRate: number | null;
};

export type AbMetric = "replyRate" | "openRate";

export type AbVerdict = {
  winner: AbVariant | null;
  metric: AbMetric | null;
  /** Statistique z du test de deux proportions sur la métrique décisive (ou la meilleure tentée). */
  z: number | null;
  /** Écart absolu en points de pourcentage. */
  gapPts: number | null;
  reason: string;
};

export const AB_RULES = {
  minSentPerVariant: 30,
  zThreshold: 1.96,
  minGapPts: { replyRate: 2, openRate: 5 } as Record<AbMetric, number>,
};

export type AbRules = typeof AB_RULES;

/** Nombre au format français (virgule décimale). */
const fr = (n: number | null): string => (n == null ? "—" : String(n).replace(".", ","));

const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 1000) / 10 : null);

function asVariant(v: unknown): AbVariant | null {
  return v === "A" || v === "B" ? v : null;
}

/**
 * Agrège les événements d'une campagne par variante.
 * @param sent  événements SENT (leadId + variante envoyée)
 * @param events autres événements (OPEN, CLICK, REPLIED, BOUNCE, UNSUBSCRIBE) ; la variante du lead
 *               (issue de l'envoi) prime sur celle éventuellement portée par l'événement.
 */
export function aggregateAbVariants(sent: AbEvent[], events: AbEvent[]): Record<AbVariant, AbVariantStats> {
  const leadVariant = new Map<string, AbVariant>();
  const sentCount: Record<AbVariant, number> = { A: 0, B: 0 };
  for (const e of sent) {
    const v = asVariant(e.variant) ?? "A";
    sentCount[v] += 1;
    if (e.leadId && !leadVariant.has(e.leadId)) leadVariant.set(e.leadId, v);
  }
  const seen: Record<AbVariant, Record<string, Set<string>>> = { A: {}, B: {} };
  for (const e of events) {
    if (!e.leadId) continue;
    const v = leadVariant.get(e.leadId) ?? asVariant(e.variant);
    if (!v) continue;
    (seen[v][e.eventType] ??= new Set()).add(e.leadId);
  }
  const build = (v: AbVariant): AbVariantStats => {
    const n = (t: string) => seen[v][t]?.size ?? 0;
    const s = sentCount[v];
    return {
      variant: v,
      sent: s,
      opens: n("OPEN"),
      clicks: n("CLICK"),
      replies: n("REPLIED"),
      bounces: n("BOUNCE"),
      unsubscribes: n("UNSUBSCRIBE"),
      openRate: pct(n("OPEN"), s),
      clickRate: pct(n("CLICK"), s),
      replyRate: pct(n("REPLIED"), s),
    };
  };
  return { A: build("A"), B: build("B") };
}

/** Test z de deux proportions (variance poolée). Renvoie 0 si la variance est nulle. */
export function twoProportionZ(x1: number, n1: number, x2: number, n2: number): number {
  if (n1 <= 0 || n2 <= 0) return 0;
  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const p = (x1 + x2) / (n1 + n2);
  const se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return 0;
  return (p1 - p2) / se;
}

const COUNT_OF: Record<AbMetric, keyof AbVariantStats> = { replyRate: "replies", openRate: "opens" };
const LABEL: Record<AbMetric, string> = { replyRate: "taux de réponse", openRate: "taux d'ouverture" };

export function abVerdict(a: AbVariantStats, b: AbVariantStats, rules: AbRules = AB_RULES): AbVerdict {
  const min = Math.min(a.sent, b.sent);
  if (min < rules.minSentPerVariant) {
    return {
      winner: null, metric: null, z: null, gapPts: null,
      reason: `Échantillon insuffisant : au moins ${rules.minSentPerVariant} envois par variante sont nécessaires (A : ${a.sent}, B : ${b.sent}).`,
    };
  }
  let best: { metric: AbMetric; z: number; gap: number } | null = null;
  for (const metric of ["replyRate", "openRate"] as AbMetric[]) {
    const key = COUNT_OF[metric];
    const z = twoProportionZ(a[key] as number, a.sent, b[key] as number, b.sent);
    const gap = Math.round(Math.abs((a[metric] ?? 0) - (b[metric] ?? 0)) * 10) / 10;
    if (Math.abs(z) >= rules.zThreshold && gap >= rules.minGapPts[metric]) {
      const winner: AbVariant = z > 0 ? "A" : "B";
      const w = winner === "A" ? a : b;
      const l = winner === "A" ? b : a;
      return {
        winner, metric, z: Math.round(z * 100) / 100, gapPts: gap,
        reason: `Variante ${winner} gagnante sur le ${LABEL[metric]} : ${fr(w[metric])} % contre ${fr(l[metric])} % (+${fr(gap)} pts, écart significatif à 95 %).`,
      };
    }
    if (!best) best = { metric, z, gap };
  }
  return {
    winner: null, metric: null, z: best ? Math.round(best.z * 100) / 100 : null, gapPts: best?.gap ?? null,
    reason: "Écart non significatif : aucune variante ne se détache nettement (réponse ou ouverture) au seuil de 95 %.",
  };
}
