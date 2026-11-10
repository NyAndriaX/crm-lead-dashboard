# AGENTS.md — démarrage rapide pour agents IA

Référence courte pour les agents (Claude Code, Codex, Cursor…). Règles détaillées : [CLAUDE.md](CLAUDE.md).

## 1. Démarrage

```bash
pnpm install
cp .env.example .env          # DATABASE_URL MySQL + secrets (openssl rand -hex 32)
pnpm db:up                    # mysql:8.4 en conteneur (port 3307)
pnpm db:deploy && pnpm db:seed
pnpm dev                      # http://localhost:3000 — admin@crm.local / ChangeMe!2026
```

| Variable | Où l'obtenir |
|---|---|
| `DATABASE_URL` | `mysql://crm:crm@localhost:3307/crm` avec `pnpm db:up` |
| `AUTH_JWT_SECRET` | `openssl rand -base64 48` |
| `PII_ENCRYPTION_KEY` | `openssl rand -hex 32` (64 caractères hex) |
| `EMAIL_HASH_SECRET` | `openssl rand -base64 32` |
| `CLAUDE_SKILLS_ENABLED` | `true` si le CLI `claude` est connecté (`claude login`) — réglage par défaut ; ensuite Configuration › Intelligence artificielle choisit le fournisseur |

## 2. Parcours utilisateur

1. `/login` → tableau de bord `/dashboard`
2. **Scraping** : créer une mission (mots-clés + pays) → le job `scraping-run` appelle le scraper →
   leads à valider → injection, enrichissement et brief IA (`crm-lead-brief`)
3. **Leads** : filtres, fiche, statuts, tags, assignation, export ; **Pipeline** : Kanban
4. **Paramètres → Emailing** : SMTP, templates (variantes IA `crm-email-variants`)
5. **Campagnes** / **Séquences** : envoi par lots en tâche de fond, personnalisation `crm-email-personalize`
6. **Inbox** : réponses relevées par IMAP, catégorisées (`crm-reply-categorize`), auto-réponse (`crm-auto-reply`)

## 3. Invariants clés

- Base : Prisma `@crm/db` (MySQL), ids `cuid`, listes JSON lues via `asStringArray()`.
- Jobs : `enqueue()` (`@crm/queue`), handlers dans `packages/jobs`. Exécutés dans le serveur web.
- IA : uniquement des skills `.claude/skills` via `runSkill()` (`@crm/ai`), quel que soit le fournisseur choisi par l'admin (Claude Skills, OpenAI, DeepSeek, Mistral, Gemini, Ollama) ; données en argument, fallback obligatoire ; dans l'UI, dire « l'IA ».
- Schéma modifié → `pnpm db:migrate`. Vérifications avant MR : `pnpm typecheck && pnpm lint && pnpm test` (+ `pnpm --filter @crm/web test:e2e` sur l'app démarrée).
