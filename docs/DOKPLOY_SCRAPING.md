# Scraping Google Maps — configuration Dokploy

## Erreurs fréquentes dans le `.env` UI

### 1. Guillemets typographiques `“` `”`

Si vous copiez depuis Word / Notion / PDF, Node peut lire `SCRAPING_LIVE=“true”` comme **faux** → le worker utilise le **sandbox** au lieu du scraper réel, ou des URLs invalides.

**Toujours utiliser des guillemets droits ASCII :** `"`

### 2. `SCRAPER_API_URL` avec `127.0.0.1`

Dans un conteneur Docker, `127.0.0.1` = le conteneur CRM, **pas** le scraper.

```env
SCRAPER_API_URL="https://votre-scraper.sslip.io"
```

Sans slash final. Même URL pour les services **web** et **worker** dans Dokploy.

### 3. Health check trop court

Le scraper prod peut mettre 4–10 s à répondre au premier `/health`.

```env
SCRAPER_HEALTH_TIMEOUT_MS="15000"
```

### 4. Mission bloquée en `running`

- `SCRAPER_TIMEOUT_MS="0"` côté CRM = le worker attend indéfiniment si le réseau bloque.
- Recommandé : `SCRAPER_TIMEOUT_MS="660000"` (11 min, au-dessus du timeout scraper `630000`).
- `SCRAPING_RUNNING_STALE_MS="2700000"` (45 min) : repasse la mission en erreur si le run dure trop longtemps.

## Checklist après modification

1. Coller le `.env` corrigé dans Dokploy (web **et** worker).
2. Redéployer / redémarrer **web + worker**.
3. Lancer une mission test.
4. Logs worker attendus :
   ```
   SCRAPING_LIVE=true · API=https://...sslip.io
   [worker] [scraping] POST https://.../scrape — keywords="..."
   ```
5. Logs scraper attendus (dès le début) :
   ```
   >>> POST /scrape depuis ...
   ```

## Vérification manuelle

```bash
curl -sS --max-time 15 "https://VOTRE-SCRAPER/health"
```
