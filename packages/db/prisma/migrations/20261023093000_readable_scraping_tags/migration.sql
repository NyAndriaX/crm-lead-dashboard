-- Tags générés par la prospection : libellés lisibles à la place des identifiants techniques.
UPDATE `leads`
SET `tags` = CAST(
  REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(CAST(`tags` AS CHAR),
    '"scraping-auto"', '"Import automatique"'),
    '"scraping"', '"Prospection IA"'),
    '"sans-email"', '"Sans email"'),
    '"sans-site"', '"Sans site web"'),
    '"decideur-identifie"', '"Décideur identifié"'),
    '"cible-ia"', '"Cible IA"')
  AS JSON)
WHERE JSON_SEARCH(`tags`, 'one', 'scraping%') IS NOT NULL
   OR JSON_SEARCH(`tags`, 'one', 'sans-%') IS NOT NULL
   OR JSON_SEARCH(`tags`, 'one', 'decideur-identifie') IS NOT NULL
   OR JSON_SEARCH(`tags`, 'one', 'cible-ia') IS NOT NULL;

-- « email-legal » n'apporte rien au commercial : retiré.
UPDATE `leads`
SET `tags` = JSON_REMOVE(`tags`, JSON_UNQUOTE(JSON_SEARCH(`tags`, 'one', 'email-legal')))
WHERE JSON_SEARCH(`tags`, 'one', 'email-legal') IS NOT NULL;
