-- AlterTable
ALTER TABLE `importJobs` ADD COLUMN `cleanedRows` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `report` JSON NULL;

-- CreateTable
CREATE TABLE `enrichmentProviderKeys` (
    `provider` VARCHAR(40) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `apiKeyEnc` BLOB NULL,
    `updatedBy` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`provider`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

