"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_ICON_SIZE_LOGIN,
  DEFAULT_ICON_SIZE_SIDEBAR,
  DEFAULT_SITE_NAME,
  type OrgBranding,
} from "@/lib/branding";

export type SiteBranding = OrgBranding;

export { DEFAULT_SITE_NAME };

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
  const siteIconSizeSidebar = branding.siteIconSizeSidebar ?? DEFAULT_ICON_SIZE_SIDEBAR;
  const siteIconSizeLogin = branding.siteIconSizeLogin ?? DEFAULT_ICON_SIZE_LOGIN;

  return { ...branding, siteName, siteIconSizeSidebar, siteIconSizeLogin, loaded };
}
