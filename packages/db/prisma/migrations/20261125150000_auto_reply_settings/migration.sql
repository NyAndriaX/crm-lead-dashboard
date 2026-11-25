-- Réponse automatique par l'IA : réglages dans Configuration › Intelligence artificielle.
ALTER TABLE `aiConfig` ADD COLUMN `autoReplyMode` VARCHAR(10) NOT NULL DEFAULT 'off';
ALTER TABLE `aiConfig` ADD COLUMN `autoReplyMeetingUrl` VARCHAR(500) NULL;
ALTER TABLE `aiConfig` ADD COLUMN `autoReplySmtpConfigId` VARCHAR(191) NULL;

-- Brouillons de réponse IA à valider avant envoi.
ALTER TABLE `inboxMessages` ADD COLUMN `isDraft` BOOLEAN NOT NULL DEFAULT false;
