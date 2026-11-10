-- Fournisseur d'IA choisi par l'administrateur (Claude Skills, OpenAI, DeepSeek, Mistral, Gemini, Ollama…).
CREATE TABLE `aiConfig` (
    `id` VARCHAR(191) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `provider` VARCHAR(40) NOT NULL DEFAULT 'claude-skills',
    `model` VARCHAR(120) NULL,
    `fastModel` VARCHAR(120) NULL,
    `baseUrl` VARCHAR(255) NULL,
    `apiKeyEnc` BLOB NULL,
    `updatedBy` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
