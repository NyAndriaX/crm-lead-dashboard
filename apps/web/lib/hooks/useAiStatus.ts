"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client";

export type AiStatus = { enabled: boolean; provider: string; label: string; vendor: string };

let cached: AiStatus | null = null;
let inflight: Promise<AiStatus | null> | null = null;

/** Fournisseur d'IA actif (badge de l'en-tête, libellés) — une requête partagée par page. */
export function useAiStatus(): AiStatus | null {
  const [status, setStatus] = useState<AiStatus | null>(cached);
  useEffect(() => {
    if (cached) return;
    inflight ??= api
      .get<{ data: AiStatus }>("/ai/status")
      .then((r) => (cached = r.data.data))
      .catch(() => null)
      .finally(() => { inflight = null; });
    void inflight.then((s) => s && setStatus(s));
  }, []);
  return status;
}
