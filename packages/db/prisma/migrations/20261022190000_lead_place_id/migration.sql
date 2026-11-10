-- AlterTable
ALTER TABLE `leads` ADD COLUMN `placeId` VARCHAR(255) NULL;

-- CreateIndex
CREATE INDEX `leads_placeId_idx` ON `leads`(`placeId`);

-- Reprise des données : l'identifiant Google Maps était stocké dans un tag technique « place:<id> ».
UPDATE `leads`
SET `placeId` = SUBSTRING(JSON_UNQUOTE(JSON_EXTRACT(`tags`, JSON_UNQUOTE(JSON_SEARCH(`tags`, 'one', 'place:%')))), 7)
WHERE JSON_SEARCH(`tags`, 'one', 'place:%') IS NOT NULL;

UPDATE `leads`
SET `tags` = JSON_REMOVE(`tags`, JSON_UNQUOTE(JSON_SEARCH(`tags`, 'one', 'place:%')))
WHERE JSON_SEARCH(`tags`, 'one', 'place:%') IS NOT NULL;
