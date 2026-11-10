import { useEffect, useState } from "react";

/** Vrai après le premier rendu client : protège ce qui dépend de `document` (portails, etc.). */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
