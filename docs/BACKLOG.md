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
| CRM-001 | `docker-compose.yml` (nextjs, worker, **mongo**, nginx — pas de Redis), réseau `crm-network`, healthcheck `/api/health` | ✅ fait |
| CRM-002 | Commande VPS (Hetzner CCX23) / MongoDB Atlas — décision infra client | ⏳ action client (J1) |
| CRM-003 | Schéma Prisma MongoDB (~25 collections, dont `jobs`) — `packages/db/prisma/schema.prisma` | ✅ fait |
| CRM-004 | Index : `@@index` Prisma (migrations MySQL) ; rétention par job `retention-purge` | ✅ fait |
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
| _(IA)_ | Personnalisation IA (optionnel) : variantes de ton — `POST /api/emailing/ai-variants`, UI modales template & bloc — skill Claude `crm-email-variants` | ✅ fait |
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

## Migration IA → Claude Skills

| Ticket | Sujet | État |
|---|---|---|
| _(IA)_ | Remplacement d'OpenAI par des **Claude Skills** exécutés par le CLI Claude Code (abonnement, sans clé API) : package `@crm/ai` (`runSkill`, sortie validée par JSON Schema, sémaphore de concurrence), 5 skills `crm-lead-brief`, `crm-email-personalize`, `crm-reply-categorize`, `crm-email-variants`, `crm-auto-reply`, CLI embarqué dans les images Docker | ✅ fait |

## Architecture v2 — monorepo unique, MySQL, serveur unique

| Ticket | Sujet | État |
|---|---|---|
| _(archi)_ | Fusion dashboard + scraper en un monorepo **pnpm + Turborepo** (`apps/web`, `apps/scraper`, `packages/*`) | ✅ fait |
| _(archi)_ | Migration **MongoDB → MySQL 8.4** : schéma Prisma, ids `cuid`, clés étrangères + cascades RGPD, listes JSON, migration initiale versionnée | ✅ fait |
| _(archi)_ | File de tâches **`@crm/queue` sur MySQL** (`SKIP LOCKED`, jobs récurrents, verrous, retries) — remplace @hokify/agenda | ✅ fait |
| _(archi)_ | Tâches de fond **`@crm/jobs`** exécutées dans le serveur Next.js (`instrumentation.ts`), séparables via `RUN_JOBS=false` | ✅ fait |
| _(archi)_ | Rétention RGPD automatique (`retention-purge` : audit/historique 12 mois, imports 90 jours) | ✅ fait |
| _(archi)_ | **Déploiement serveur unique** : `deploy/docker-compose.yml` (nginx TLS + web + scraper + MySQL + certbot), scripts bootstrap / init-ssl / deploy / backup | ✅ fait |

## Refonte UI « Nebula » et parcours utilisateur

| Ticket | Sujet | État |
|---|---|---|
| _(UI)_ | Design system « Nebula » (`lib/theme.ts`, `globals.css`) : verre dépoli, fond aurore, animations, composants `components/ui/*` | ✅ fait |
| _(UI)_ | **Mode clair** : bascule mémorisée (cookie `crm-theme` lu côté serveur, sans flash), variables CSS `--nb-*` par thème, chips assombries en clair | ✅ fait |
| _(UI)_ | Robot de prospection animé + radar ; Connexion, Tableau de bord, Prospection IA, Pipeline, Réponses, Analytics, Configuration refaits | ✅ fait |
| _(UX)_ | Principe : **pas de modale pour un parcours** — modales réservées aux formulaires courts et aux confirmations ; liens profonds (`?tab=`, `?category=`, `?leadId=`, `?scoreMin=`) | ✅ fait |
| _(UX)_ | Campagnes : onglets Campagnes / Segments / Performance, liste paginée filtrable (statut, segment, tri), assistant 4 étapes `campaigns/new` (audience → message → envoi → lancement) avec aperçu email et projection d'envoi, page détail `campaigns/[id]`, duplication | ✅ fait |
| _(UX)_ | Segments : constructeur pleine page `campaigns/segments/*` alimenté par `GET /api/leads/facets`, aperçu d'audience en direct `POST /api/segments/preview` (joignables, sans email, blacklist, échantillon) | ✅ fait |
| _(UX)_ | Relances : constructeur de parcours `sequences/new`, page détail `sequences/[id]` (position des leads par étape, inscription inline d'un **segment entier** ou de leads recherchés) | ✅ fait |
| _(UX)_ | Fiche lead 360° : étape commerciale cliquable, « Ce que Claude a compris », activité unifiée (historique lisible + suivi email + échanges, `GET /api/leads/:id/engagement`), séquences du lead | ✅ fait |
| _(UX)_ | Tableau de bord : centre « À traiter maintenant » (`GET /api/dashboard/actions`) | ✅ fait |
| _(fix)_ | Variables de fusion : objet jamais personnalisé + alias `{{firstName}}`/`{{company}}` non remplacés → helper partagé `packages/jobs/src/mergeVars.ts` | ✅ fait |
| _(fix)_ | Taux campagnes > 100 % (ouvertures multiples) → comptage par contact unique ; segment de démo « Leads VIP » au filtre ignoré (`tags` → `tag`) ; inscription séquence limitée à `pageSize=500` (refusé par l'API) | ✅ fait |
| _(scraper)_ | Emails de conformité (`dpo@`, `rgpd@`…) exclus, adresses « métier » en dernier recours ; analyse IA sur la fiche Maps seule quand il n'y a pas de site ; délai skill 120 s | ✅ fait |
| _(fix)_ | Missions > 5 min coupées puis relancées en boucle : l'Agent undici était importé mais pas utilisé → `undiciFetch` + `dispatcher` (vérifié sur un serveur répondant après 330 s) | ✅ fait |
| _(fix)_ | Scraper : un timeout de skill pouvait faire échouer toute la mission (`ProcessLookupError` au kill) → kill toléré, analyse IA jamais fatale, message d'erreur explicite | ✅ fait |
| _(scoring)_ | Formule de score unique dans `@crm/db` (`computeLeadScore`, 3 copies supprimées), **potentiel IA** pondéré (adéquation cible / brief, 30 pts par défaut, réglable), score calculé dès l'injection des leads scrapés, poids admin appliqués aussi par les tâches de fond | ✅ fait |
| _(données)_ | Migration `20261022190000_lead_place_id` : colonne indexée `leads.placeId` (dédoublonnage Google Maps) au lieu du tag technique `place:…` ; URL des sites nettoyées des paramètres `utm_*` | ✅ fait |
| _(tests)_ | Tests unitaires TypeScript (`node --test` + tsx) : score, filtres de segment, tags scraping, URL, variables de fusion ; scraper : 27 tests pytest | ✅ fait |
| _(UI)_ | Carte des leads réécrite (Leaflet direct, plus de crash « Map container is already initialized », thème sombre/clair, liste des villes) ; page d'invitation au style Nebula ; polices auto-hébergées (`next/font`) | ✅ fait |
| _(UI)_ | Éditeur Quill : barre d'outils au thème, zone d'édition blanche (rendu fidèle de l'email) ; éditeur de template en pleine page `settings/templates/*` avec aperçu sur un vrai lead | ✅ fait |
| _(UI)_ | **Charte sobre** : une seule couleur d'accent (violet), neutres ardoise, couleurs sémantiques réservées aux statuts ; dégradés arc-en-ciel et aurore supprimés ; étapes du pipeline recolorées ; badge Next.js masqué en dev | ✅ fait |
| _(scraper)_ | **Contacts enrichis** : téléphones du site (fixe/mobile, E.164), réseaux sociaux, page contact, SIREN/SIRET, forme juridique, capital ; email / ligne directe du décideur si Claude peut les attribuer (valeurs du site uniquement). Données personnelles chiffrées (`leads.contactsEnc`, migration `20261023080000_lead_contacts_enc`), données d'entreprise dans `enrichment.siteContacts` | ✅ fait |
| _(fix)_ | Rendu serveur : `createPortal(document.body)` sur les pages « nouveau » (HTTP 500) → hook `useMounted` | ✅ fait |
| _(fix)_ | Prospection : plus de prénom déduit d'une adresse générique (`contact@` → « Contact ») ; tags générés lisibles (« Prospection IA », « Cible IA », « Décideur identifié »…, migration `20261023093000_readable_scraping_tags`) ; carte pipeline sans doublon entreprise | ✅ fait |
| _(fix)_ | Prospection : la mission mise en avant est la plus récemment active (colonne `scrapingMissions.updatedAt`, migration `20261023090000_mission_updated_at`), ou celle dont des résultats attendent une validation ; titres explicites (« aucune dans la cible », « N ajoutés au CRM ») | ✅ fait |
| _(IA)_ | **Fournisseur d'IA au choix de l'administrateur** : Claude Skills (CLI, sans choix de modèle), OpenAI, DeepSeek, Mistral, Gemini, Ollama, service compatible OpenAI ; clé chiffrée, modèle de rédaction + modèle rapide, bouton « Tester la connexion » ; mêmes SKILL.md pour tous les fournisseurs ; scraper aligné via `ScrapeRequest.ai` (table `aiConfig`, migration `20261023100000_ai_config`) | ✅ fait |
| _(UI)_ | Mentions « Claude » retirées de l'interface (« l'IA ») ; badge du fournisseur actif dans l'en-tête et la barre latérale | ✅ fait |
| _(fix)_ | `position: sticky` inopérant partout (conteneur principal en `overflow-x: hidden`) → `overflow-x: clip` ; menu de la Configuration à défilement propre | ✅ fait |
| _(tests)_ | **Tests de bout en bout** Playwright (`apps/web/e2e`, `pnpm --filter @crm/web test:e2e`) : connexion, assistant de campagne + duplication, segment créé depuis l'assistant, constructeur de séquence, configuration IA, fiche lead, carte — 9 parcours, données nettoyées | ✅ fait |
| _(fix)_ | Brouillon de campagne perdu au retour de la création d'un segment (lecture du `sessionStorage` dans un effet exécuté deux fois) → lecture unique à l'initialisation ; trouvé par l'E2E | ✅ fait |
