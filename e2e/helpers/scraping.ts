/** Payload minimal compatible crm-leads-scraper pour les tests e2e. */
export function fakeScrapedLead(args: {
  email: string;
  company: string;
  placeId?: string;
}) {
  return {
    source: "google_maps",
    company: args.company,
    email: args.email,
    email_status: "found",
    city: "Lyon",
    country: "France",
    place_id: args.placeId ?? `e2e-place-${Date.now()}`,
    scraped_at: new Date().toISOString(),
  };
}

export function defaultMissionConfig(overrides: Record<string, unknown> = {}) {
  return {
    keywords: "e2e-test",
    location: { city: "Lyon", country: "France", radiusKm: null },
    limit: 5,
    detailed: true,
    locale: "fr-FR",
    filter_country: true,
    requireEmail: true,
    schedulePlan: { mode: "manual" as const },
    ...overrides,
  };
}
