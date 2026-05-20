<!-- Branche cible : `develop` (les MR `develop → main` sont réservées aux releases). -->

## Ticket

Closes CRM-XXX

## Description

<!-- Que fait cette MR ? Pourquoi ? -->

## Changements

- 

## Comment tester

1. 

## Checklist

- [ ] Branche issue de `develop`, nommée `feat/CRM-XXX-...` ou `fix/CRM-XXX-...`
- [ ] La MR référence le ticket CRM-XXX et cible `develop`
- [ ] `yarn lint` et `yarn typecheck` passent (CI verte)
- [ ] Tests ajoutés / mis à jour si nécessaire
- [ ] UI conforme Ant Design 5 (aucune autre lib UI introduite)
- [ ] Pas de secret committé ; `.env.example` + `docs/ENV.md` à jour si nouvelle variable
- [ ] Doc mise à jour si nécessaire (`docs/`, `README.md`, OpenAPI)
- [ ] Critères d'acceptation du ticket vérifiés
