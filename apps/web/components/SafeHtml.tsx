"use client";

import { useEffect, useMemo, useState } from "react";
import DOMPurify from "dompurify";

/**
 * Rendu d'HTML d'email reçu en environnement isolé : XSS-safe via DOMPurify.
 * - Désactive les scripts, formulaires, iframes externes, javascript:URL.
 * - Force tous les liens en target=_blank + rel="noopener noreferrer".
 * - Côté SSR : on rend un placeholder ; le purificateur n'existe qu'au navigateur.
 */
export default function SafeHtml({ html, style }: { html: string | null | undefined; style?: React.CSSProperties }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const safe = useMemo(() => {
    if (!mounted || !html) return "";
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    });
    const out = DOMPurify.sanitize(html, {
      FORBID_TAGS: ["script", "iframe", "form", "object", "embed", "base", "meta"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onsubmit"],
      ALLOW_DATA_ATTR: false,
    });
    DOMPurify.removeAllHooks();
    return out;
  }, [html, mounted]);

  if (!html) return <span style={{ color: "#999" }}>(corps vide)</span>;
  if (!mounted) return <div style={style}>…</div>;
  return <div style={style} dangerouslySetInnerHTML={{ __html: safe }} />;
}
