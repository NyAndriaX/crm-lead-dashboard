<!-- MR de release : `develop → main`. À sélectionner via "Choose a template" → Release. -->

## Release `vX.Y.Z`

Promotion de `develop` vers `main`.

## Contenu (tickets / lots inclus)

- 

## Checklist release

- [ ] CI verte sur `develop`
- [ ] `CHANGELOG` / notes de version à jour (si applicable)
- [ ] Migrations / nouvelles variables d'env documentées (`docs/ENV.md`)
- [ ] Smoke tests passés sur l'environnement de pré-prod (CRM-078)
- [ ] Backup pré-déploiement planifié + plan de rollback (CRM-079)
- [ ] Tag `vX.Y.Z` à créer après merge
