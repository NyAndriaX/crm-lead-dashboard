"use client";

// Client HTTP côté navigateur. Les cookies (crm_at / crm_rt) sont envoyés
// automatiquement (same-origin). Sur 401, on tente un /api/auth/refresh une fois.
import axios, { AxiosError } from "axios";

export const api = axios.create({ baseURL: "/api", withCredentials: true });

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
