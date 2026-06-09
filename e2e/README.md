# Tests E2E — CRM Lead Dashboard

Tests Playwright pour valider les régressions sur **tags (scraping + bulk)** et **consommation OpenAI ($)**.

## Prérequis

1. Base MySQL accessible (`DATABASE_URL` dans `.env`)
2. Données de seed : `yarn db:seed`
3. Chromium Playwright : `yarn test:e2e:install`

## Lancer les tests

```bash
# Démarre Next.js (port 3000) si absent, puis exécute les tests
yarn test:e2e

# Interface Playwright
yarn test:e2e:ui

# Rapport HTML après échec
yarn test:e2e:report
```

Variables optionnelles (`.env`) :

| Variable | Défaut |
|----------|--------|
| `E2E_BASE_URL` | `http://localhost:3000` |
| `E2E_ADMIN_EMAIL` | `admin@crm.local` |
| `E2E_ADMIN_PASSWORD` | `ChangeMe!2026` |

## Fichiers de test

| Fichier | Ce qui est vérifié |
|---------|-------------------|
| `auth.api.spec.ts` | Login, session `/api/auth/me` |
| `leads-crud.api.spec.ts` | CRUD lead, statut, assignation, tags, restore |
| `tags-referential.api.spec.ts` | Référentiel `POST/GET /api/tags` |
| `tags-bulk-leads.api.spec.ts` | Bulk `tags-add` |
| `tags-scraping-injection.api.spec.ts` | Tags scraping → injection CRM |
| `segments.api.spec.ts` | CRUD segments + preview |
| `sequences.api.spec.ts` | CRUD séquences de relance |
| `pipeline.api.spec.ts` | Colonnes pipeline + déplacement lead |
| `pipeline-lead-features.api.spec.ts` | Potentiel EUR, notes RGPD, documents, sync statut, analytics pipeline |
| `pipeline-drawer.ui.spec.ts` | Clic carte pipeline → drawer (sans quitter `/pipeline`) |
| `analytics-pipeline.ui.spec.ts` | Onglet Analytics Pipeline + métriques potentiel EUR |
| `lead-views.api.spec.ts` | Vues personnalisées leads |
| `campaigns.api.spec.ts` | Liste + création campagne (si SMTP dispo) |
| `notifications-analytics.api.spec.ts` | Notifications, analytics, imports |
| `inbox.api.spec.ts` | Inbox + configs IMAP |
| `openai-usage-dashboard.api.spec.ts` | Coût OpenAI agrégé admin |
| `openai-usage-dashboard.ui.spec.ts` | Carte OpenAI sur le dashboard |
| `dashboard.api.spec.ts` | KPIs dashboard + structure stats |
| `templates-users.api.spec.ts` | Templates email + RBAC + users |
| `pages-smoke.ui.spec.ts` | Toutes les pages principales chargent sans erreur JS |

Les tests créent des données préfixées `e2e-*` et les nettoient en `afterAll`.
