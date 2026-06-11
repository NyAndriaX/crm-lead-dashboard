"use client";

import { useEffect, useState } from "react";

export type SiteBranding = {
  siteName?: string;
  siteIconUrl?: string | null;
};

export const DEFAULT_SITE_NAME = "CRM Lead Dashboard";

export function useSiteBranding() {
  const [branding, setBranding] = useState<SiteBranding>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/organization/branding")
      .then((r) => r.json())
      .then((j: { data?: SiteBranding }) => setBranding(j.data ?? {}))
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const siteName = branding.siteName?.trim() || DEFAULT_SITE_NAME;

  return { ...branding, siteName, loaded };
}
