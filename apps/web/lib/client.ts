"use client";

// Client HTTP côté navigateur. Les cookies (crm_at / crm_rt) sont envoyés
// automatiquement (same-origin). Sur 401, on tente un /api/auth/refresh une fois.
import axios, { AxiosError } from "axios";

/** Empêche le navigateur de servir des réponses API obsolètes depuis son cache HTTP. */
const NO_CACHE_HEADERS = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { ...NO_CACHE_HEADERS },
});

api.interceptors.request.use((config) => {
  for (const [key, value] of Object.entries(NO_CACHE_HEADERS)) {
    config.headers.set(key, value);
  }
  return config;
});

/** `fetch` same-origin vers `/api/*` sans cache navigateur (hors axios). */
export function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(NO_CACHE_HEADERS)) {
    headers.set(key, value);
  }
  return fetch(input, {
    credentials: "include",
    cache: "no-store",
    ...init,
    headers,
  });
}

let refreshing: Promise<unknown> | null = null;

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (typeof error.config & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retried && !original.url?.includes("/auth/")) {
      original._retried = true;
      try {
        refreshing = refreshing ?? api.post("/auth/refresh");
        await refreshing;
        refreshing = null;
        return api(original);
      } catch {
        refreshing = null;
        if (typeof window !== "undefined") window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);
