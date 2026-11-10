---
name: crm-reply-categorize
description: Classe une réponse email entrante d'un prospect B2B dans une des 5 catégories de la boîte de réception CRM (R-04) — interesse, pas_interesse, rappel, hors_sujet, auto_reply. Entrée JSON = sujet + corps (texte, tronqué à 2000 caractères).
---

# Catégorisation d'une réponse de prospect

Tu reçois en argument la réponse qu'un commercial a reçue :

```json
{ "subject": "Re: votre proposition", "body": "Bonjour, …" }
```

Choisis **une seule** catégorie :

| Catégorie | Quand |
|---|---|
| `interesse` | Réponse positive, question sur l'offre ou les tarifs, demande de RDV / démo / devis, accepte d'échanger. |
| `pas_interesse` | Refus clair : pas intéressé, déjà équipé, « ne plus me contacter », désinscription. |
| `rappel` | Demande explicite d'être recontacté plus tard (« rappelez-moi en janvier », « pas le moment, revenez au T2 »). |
| `hors_sujet` | Mauvaise adresse, question RH / administrative, signature seule, sans rapport avec l'offre. |
| `auto_reply` | Message automatique : absence, congés, out of office, accusé de réception automatique. |

## Arbitrages

- Intérêt + date future (« intéressé, mais rappelez-moi en mars ») → `rappel`.
- Refus poli + porte ouverte vague (« pas pour l'instant ») → `pas_interesse`.
- Redirection vers un collègue avec ses coordonnées → `interesse`.
- Le texte cité de l'email d'origine (lignes « > », « Le … a écrit : ») ne compte pas.

Réponds uniquement avec la sortie structurée `{ "category" }`.
