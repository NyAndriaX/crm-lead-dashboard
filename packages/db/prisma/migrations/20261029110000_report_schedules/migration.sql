-- AN-05 : envoi planifié du rapport d'analytique par email (job récurrent report-schedule-tick).
-- CreateTable
CREATE TABLE `reportSchedules` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `frequency` VARCHAR(10) NOT NULL DEFAULT 'weekly',
    `hour` INTEGER NOT NULL DEFAULT 8,
    `dayOfWeek` INTEGER NULL,
    `dayOfMonth` INTEGER NULL,
    `period` VARCHAR(5) NOT NULL DEFAULT '30d',
    `recipients` JSON NOT NULL,
    `includeXlsx` BOOLEAN NOT NULL DEFAULT false,
    `smtpConfigId` VARCHAR(191) NULL,
    `nextRunAt` DATETIME(3) NULL,
    `lastSentAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `reportSchedules_enabled_nextRunAt_idx`(`enabled`, `nextRunAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

