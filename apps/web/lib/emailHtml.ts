/**
 * Normalise le HTML généré par l'IA pour un rendu email correct.
 */
export function normalizeAiEmailHtml(raw: string): string {
  let html = raw.trim();
  if (!html) return "<p>Bonjour,</p>";

  // Retire les fences markdown
  html = html.replace(/^```html?\s*/i, "").replace(/```\s*$/i, "").trim();

  // Convertit le markdown basique en HTML si pas de balises
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    const paragraphs = html
      .split(/\n{2,}/)
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const lines = p
          .split(/\n/)
          .map((l) => l.replace(/^[-*•]\s+/, "").trim())
          .filter(Boolean);
        return `<p>${lines.join("<br/>")}</p>`;
      });
    return paragraphs.join("\n") || `<p>${html.replace(/\n/g, "<br/>")}</p>`;
  }

  // Remplace les listes <ul> à un seul item ou listes inutiles par des paragraphes
  html = html.replace(/<ul>\s*<li>([\s\S]*?)<\/li>\s*<\/ul>/gi, "<p>$1</p>");

  // Assure des paragraphes plutôt que <br><br>
  if (!/<p[\s>]/i.test(html) && /<br\s*\/?>/i.test(html)) {
    html = html
      .split(/<br\s*\/?>\s*<br\s*\/?>/gi)
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => `<p>${chunk.replace(/<br\s*\/?>/gi, "<br/>")}</p>`)
      .join("\n");
  }

  return html;
}
