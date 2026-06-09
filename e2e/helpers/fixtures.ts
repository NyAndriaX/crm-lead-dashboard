import { test as base, expect, type APIRequestContext } from "@playwright/test";
import { loginApi } from "./auth";

/** Contexte API déjà authentifié (admin par défaut). */
export const test = base.extend<{ authedRequest: APIRequestContext }>({
  authedRequest: async ({ request }, use) => {
    await loginApi(request);
    await use(request);
  },
});

export { expect };

export function e2eId(label: string): string {
  return `e2e-${label}-${Date.now()}`;
}
