import { ApiError, handler } from "@/lib/api";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

// GET /api/docs — Swagger UI (charge /api/openapi.json, lui-même réservé Admin).
// Page accessible aux utilisateurs connectés ; la spec ne se charge que pour un Admin.
export const GET = handler(async () => {
  const s = await getSession();
  if (!s) throw new ApiError(401, "Authentification requise", "unauthenticated");

  const html = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>CRM Lead Dashboard — API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.ui = SwaggerUIBundle({ url: "/api/openapi.json", dom_id: "#swagger-ui", deepLinking: true });
    </script>
  </body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
});
