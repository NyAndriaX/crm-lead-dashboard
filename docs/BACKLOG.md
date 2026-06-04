# Backlog — périmètre « site web + dashboard »

> Le scraping (CRM-054→061) et l'enrichissement OSINT/API (CRM-062→067) sont **hors périmètre** pour l'instant.
> Les démarches externes (DNS SPF/DKIM/DMARC `CRM-028`, page LinkedIn `CRM-053`, DPO `CRM-068`) sont à relancer en temps voulu mais ne bloquent pas le développement (emailing testable en mode Mailpit/Mailtrap).

## Lots livrables (épics)

| Lot | Tickets CDC | Sprint | Livrable |
|---|---|---|---|
| **L0 — Bootstrap** | _(nouveau)_ | S0 | Monorepo Yarn 1 (workspaces), CI GitLab, Docker Compose, docs — ✅ **fait** |
| **L1 — Socle** | CRM-001 → CRM-010 | S1 | Infra Docker, schéma Prisma + index, crypto AES-256-GCM, Auth + 2FA, RBAC, OpenAPI, CRUD Leads, shell dashboard Ant Design — ✅ **fait** (détails ci-dessous) |
| **L2 — Leads** | CRM-011 → CRM-020 | S2 | Fiche lead, filtres avancés, recherche, workflow statuts, tags, assignation, vues perso, export CSV/XLSX, scoring, audit log — 🟧 **en cours** (détails ci-dessous) |
| **L3 — Import** | CRM-021 → CRM-027 | S2 | Upload CSV/XLSX, modèle téléchargeable, mapping colonnes, aperçu, dédoublonnage + validation, import async (file `jobs`), historique imports |
| **L4 — Emailing** | CRM-029 → CRM-039 | S3 | Config SMTP chiffrée, guide DNS + vérificateur, éditeur templates WYSIWYG, bibliothèque, campagnes + planification, segmentation, worker d'envoi régulé, tracking, bounces, désabonnement RFC 8058, dashboard campagne |
| **L5 — Réponses** | CRM-040 → CRM-045 | S4 | Inbox IMAP, association réponse↔lead + arrêt relances, lecture/réponse, catégorisation auto, notifications, détection auto-reply |
| **L6 — Relances** | CRM-046 → CRM-050 | S4 | Séquences multi-étapes, conditions d'envoi/arrêt, variables + max relances, dashboard séquences, pause/reprise/exclusion |
| **L7 — Pipeline** | CRM-051 → CRM-052 | S4 | Kanban drag & drop, configuration des étapes (admin) |
| **L8 — Analytics** | CRM-069 → CRM-070 | S6 | Dashboard KPIs, reports exportables PDF/CSV/Excel |
| **L9 — Users & RGPD** | CRM-020, CRM-071 → CRM-073 | S6 | Gestion users/équipes/invitations, droit à l'oubli + export, liste noire globale |
| **L10 — Qualité & Go-Live** | CRM-076 → CRM-079 | S6 | Tests E2E (Playwright) + charge (k6), documentation, pré-prod + smoke tests, recette + Go Live |

_(Optionnels, à arbitrer plus tard : CRM-074 personnalisation IA, CRM-075 webhooks Zapier/Make.)_

## Sprint 1 (L1) — état détaillé

| Ticket | Sujet | État |
|---|---|---|
| CRM-001 | Image Docker unique (web+worker, `apps/web/Dockerfile` ou équivalent), healthcheck `/api/health` — déploiement sans docker-compose | ✅ fait |
| CRM-002 | Commande VPS (Hetzner CCX23) / MongoDB Atlas — décision infra client | ⏳ action client (J1) |
| CRM-003 | Schéma Prisma MongoDB (~25 collections, dont `jobs`) — `packages/db/prisma/schema.prisma` | ✅ fait |
| CRM-004 | Index Mongo : `@@index` + text index `leads` (`@@fulltext`) ; TTL / partiels manuels | ✅ Prisma + `manual-indexes.md` |
| CRM-005 | `apps/web/lib/crypto.ts` : AES-256-GCM + HMAC-SHA256 (`emailHash`) | ✅ fait |
| CRM-006 | Auth JWT custom + bcrypt cost 12 + TOTP (otplib) — `lib/auth.ts`, `/api/auth/login\|logout\|refresh\|me`, page login branchée | ✅ fait |
| CRM-007 | RBAC 4 rôles : matrice `lib/rbac.ts` + `middleware.ts` + `requirePermission()`/`requireRole()` | ✅ fait (tests unitaires à compléter) |
| CRM-008 | OpenAPI 3.1 (zod-to-openapi) — `/api/openapi.json` (Admin) + Swagger UI `/api/docs` | ✅ fait (couvre Auth + Leads ; à enrichir) |
| CRM-009 | CRUD Leads + listing paginé (50/100/200, tri, filtres, recherche), soft delete + restore — `/api/leads*`, service + schémas Zod | ✅ fait |
| CRM-010 | Next.js 15 + Ant Design 5 + theming, layout dashboard, page Leads branchée sur l'API | ✅ fait |

> Reste à faire sur L1 : tests unitaires RBAC (toutes combinaisons rôle × permission), tests des route handlers, bouton "Nouveau lead" (modal de création).

## Sprint 2 (L2) — état détaillé

| Ticket | Sujet | État |
|---|---|---|
| CRM-011 | Fiche lead détaillée (Descriptions + Timeline historique) — `GET /api/leads/:id/history`, page `app/(dashboard)/leads/[id]` (coordonnées, score, assignation, tags, changement de statut, archivage) | ✅ fait |
| CRM-012 | Filtres avancés multi-critères (statut, source, secteur, ville/pays, score min/max, période, tag, assigné) — `leadFilters` Zod, `buildWhere`, UI filtres dans la liste | ✅ fait |
| CRM-013 | Recherche multi-champs insensible à la casse (firstName/lastName/company/notes) + debounce client | ✅ fait (`contains` ; `$text` ranké via `findRaw` possible plus tard) |
| CRM-014 | Workflow statuts (machine à états, transitions validées) — `lib/leadStatus.ts`, `POST /api/leads/:id/status` ; entrée dans CONVERTI/PERDU/EN_DISCUSSION → job `sequences-stop` | ✅ fait |
| CRM-015 | Tags multi-tags + référentiel `tags` (création à la volée) — `PUT /api/leads/:id/tags`, `GET/POST /api/tags`, Select mode=tags | ✅ fait |
| CRM-016 | Assignation commercial + notification in-app — `POST /api/leads/:id/assign`, `Notification` + job `notification`, `GET /api/users` | ✅ fait (email de notif = job placeholder, CRM-044) |
| CRM-017 | Vues personnalisées (filtres + colonnes + tri) — `GET/POST /api/lead-views`, `PUT/DELETE /api/lead-views/:id`, sélecteur + "Sauvegarder la vue" dans la liste | ✅ fait |
| CRM-018 | Export CSV / XLSX du listing courant (filtres appliqués, choix des colonnes) — `GET /api/leads/export?format=csv\|xlsx`, `lib/csv.ts`, SheetJS | ✅ fait |
| CRM-019 | Lead scoring 0–100 — `lib/scoring.ts` (poids configurables via `SCORING_WEIGHTS`), recalcul synchrone sur les mutations + `POST /api/leads/:id/recalculate-score` + job `scoring` (batch) ; `antd Progress` dans la fiche | ✅ fait (UI admin d'ajustement des poids à faire) |
| CRM-020 | Audit log + historique modifications | ✅ fait (L1) |

> Reste sur L2 : modal de création de lead, UI admin des poids de scoring, recherche `$text` rankée (optionnel), tests, enrichissement de l'OpenAPI avec les nouveaux endpoints, intégration "tag/source par défaut" (rejoint L3 import).

## Sprints suivants

L3 (Import CSV/XLSX) puis L4 (Emailing). Voir le tableau des lots ci-dessus.

### L4 — Emailing (suivi CRM CRM-029 → CRM-039)

_Table de suivi alignée sur le lot L4 ; le fichier maître Excel est `docs/backlog/CRM_SUIVI_TICKETS_v2.xlsx` (onglets 📋 / ✅ / 📊)._

| Ticket | Sujet | État |
|---|---|---|
| CRM-029 | Config SMTP chiffrée (CRUD `/api/smtp-configs`, onglet Emailing) | ✅ fait |
| CRM-030 | Guide DNS SPF / DKIM / DMARC intégré (réglages) | ✅ fait |
| CRM-031 | Éditeur de templates : WYSIWYG (Quill) + HTML (Monaco), variables de fusion, aperçu bureau / mobile | ✅ fait |
| CRM-032 | Bibliothèque templates & blocs : duplication API, partage `isPublic` | ✅ fait |
| _(IA)_ | Personnalisation IA (optionnel) : variantes de ton — `POST /api/emailing/ai-variants`, UI modales template & bloc, `OPENAI_API_KEY` | ✅ fait |
| CRM-033 | Page **Campagnes** (`/campaigns`) : CRUD, planification, job `campaign-send` | ✅ fait |
| CRM-034 | Segmentation : API `/segments`, filtres alignés sur les leads | ✅ fait |
| CRM-035 | Worker d’envoi régulé (`campaign-send`, lots + re-queue) | ✅ fait |
| CRM-036 | Tracking ouvertures / clics (`/api/emailing/track/*`) | ✅ fait |
| CRM-037 | Bounces (événement + statut lead sur échec SMTP) | ✅ fait |
| CRM-038 | Désabonnement RFC 8058 (`/api/emailing/unsub`, List-Unsubscribe) | ✅ fait |
| CRM-039 | Dashboard campagne (stats agrégées `/api/campaigns/:id/stats`) | ✅ fait |
| _(qualité build)_ | Chaîne `next build` stabilisée — routes `params: Promise`, export XLSX `Uint8Array`, login `Suspense`, `assignedTo` Prisma, typage export/historique, Quill client-only (voir aussi suivi Excel) | ✅ fait |

**Prochain focus L4 recommandé :** affinages (file d’attente dédiée par campagne, hard bounces SMTP, relance auto) ou **L5 Inbox** selon priorité produit.

### Definition of Done (par ticket)

- Code + types stricts, `yarn lint` & `yarn typecheck` verts
- Tests pertinents (unitaires / route handlers ; E2E pour les parcours clés — CRM-076)
- UI strictement Ant Design 5
- Endpoints documentés dans l'OpenAPI (`lib/openapi.ts`)
- `.env.example` + `docs/ENV.md` à jour si nouvelle variable
- MR référence le ticket, CI verte, revue d'un pair
- Critères de validation du ticket CDC vérifiés
