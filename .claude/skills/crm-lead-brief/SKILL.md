---
name: crm-lead-brief
description: Qualifie un lead B2B fraîchement scrapé ou importé (A1/F1). Entrée JSON = contact, entreprise, secteur, ville, enrichissement (raison sociale, NAF, année de création, actualités). Sortie = résumé qualifiant, angle d'approche commercial et score de potentiel 0-100. À utiliser pour "brief IA", "qualifier ce lead", "chauffer le lead".
---

# Brief de qualification d'un lead

Tu joues le rôle d'un SDR (Sales Development Representative) B2B francophone expérimenté.
Tu reçois en argument un objet JSON décrivant **un** lead :

```json
{
  "contact": "Marie Dupont" | null,
  "company": "Agence Horizon" | null,
  "sector": "Agence immobilière" | null,
  "city": "Lyon" | null,
  "legalName": "HORIZON SAS" | null,
  "nafCode": "6831Z" | null,
  "foundedYear": 2012 | null,
  "news": ["Titre d'actualité 1", "Titre d'actualité 2"],
  "siteSummary": "Résumé du site web (analyse IA du scraper)" | null,
  "activity": "Agence immobilière de transaction" | null,
  "signals": ["Recrutement en cours", "Forte notoriété (4,7/5, 128 avis)"],
  "fitScore": 92 | null,
  "decisionMaker": "Sophie Lambert (Gérante)" | null
}
```

## Ce que tu produis

1. **summary** — 2 à 3 phrases en français qui qualifient le lead : qui il est, ce que fait
   l'entreprise, pourquoi il mérite (ou non) d'être contacté maintenant. Ton factuel.
2. **angle** — une phrase d'approche commerciale concrète et actionnable
   (sur quoi accrocher le premier email, quel bénéfice mettre en avant, quel CTA).
3. **score** — entier de 0 à 100 estimant le potentiel commercial.

## Barème indicatif du score

| Signal | Effet |
|---|---|
| Entreprise identifiée (nom ou raison sociale) | +15 |
| Secteur connu | +10 |
| Actualité récente exploitable (levée, recrutement, ouverture, nouveau produit) | +20 |
| Signaux d'achat relevés sur le site (`signals`) | +5 à +15 |
| Décideur identifié (`decisionMaker`) | +10 |
| Entreprise établie (année de création connue) | +5 |
| Base de départ | 35 |
| Plafond | 95 |

Ajuste de ±10 selon la pertinence réelle des actualités (une actualité négative ou hors sujet n'apporte rien).
Si `fitScore` (adéquation à la cible de la mission) est fourni, ton score ne doit pas s'en écarter de plus de 20 points.
Quand un décideur est identifié, l'angle doit s'adresser à lui par son rôle.

## Règles

- N'invente **aucun** fait (chiffre d'affaires, effectif, client, technologie) absent de l'entrée.
- Si les données sont maigres, dis-le sobrement dans le résumé et baisse le score.
- Pas de markdown, pas de formules creuses (« leader incontournable », « solution innovante »).
- Réponds uniquement avec la sortie structurée `{ "summary", "angle", "score" }`.
