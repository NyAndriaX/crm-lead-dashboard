-- Date de dernière activité d'une mission (affichage de la « dernière mission »).
ALTER TABLE `scrapingMissions` ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- Reprise : la date de création sert de point de départ.
UPDATE `scrapingMissions` SET `updatedAt` = `createdAt`;
