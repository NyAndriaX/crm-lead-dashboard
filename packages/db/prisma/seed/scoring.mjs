const DEFAULT_WEIGHTS = {
  hasEmail: 12,
  hasPhone: 8,
  hasCompany: 8,
  hasWebsite: 4,
  hasSector: 4,
  hasLocation: 4,
  enriched: 10,
  perOpen: 4,
  maxOpens: 12,
  perClick: 6,
  maxClicks: 18,
  replied: 20,
  statusBonus: {
    CONTACTE: 5,
    QUALIFIE: 12,
    EN_DISCUSSION: 18,
    CONVERTI: 25,
    PERDU: -10,
  },
};

export function computeScore(lead, signals = { opens: 0, clicks: 0, hasReplied: false }) {
  const w = DEFAULT_WEIGHTS;
  let s = 0;
  if (lead.emailHash) s += w.hasEmail;
  if (lead.phoneEnc) s += w.hasPhone;
  if (lead.company) s += w.hasCompany;
  if (lead.website) s += w.hasWebsite;
  if (lead.sector) s += w.hasSector;
  if (lead.city || lead.country) s += w.hasLocation;
  if (lead.enrichment) s += w.enriched;
  s += Math.min(w.maxOpens, signals.opens * w.perOpen);
  s += Math.min(w.maxClicks, signals.clicks * w.perClick);
  if (signals.hasReplied || lead.lastReplyAt) s += w.replied;
  s += w.statusBonus[lead.status] ?? 0;
  return Math.max(0, Math.min(100, Math.round(s)));
}

export const SCORING_WEIGHTS = DEFAULT_WEIGHTS;
