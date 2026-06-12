import { Prisma } from "@prisma/client";

export type FormattedPrismaError = {
  code: string;
  message: string;
  hint?: string;
  /** Message court pour stockage en base (Job.lastError). */
  shortMessage: string;
};

function schemaOutOfDate(message?: string): FormattedPrismaError {
  return {
    code: "schema_out_of_date",
    message:
      message ??
      "La base de données n'est pas à jour avec le code (colonne ou table manquante).",
    hint: "Exécutez : yarn db:push puis yarn db:migrate-owners --apply",
    shortMessage: "Schéma base de données obsolète — yarn db:push",
  };
}

/** Transforme une erreur Prisma / infra en message exploitable (worker, logs, API). */
export function formatPrismaError(e: unknown): FormattedPrismaError {
  if (e instanceof Prisma.PrismaClientInitializationError) {
    return {
      code: "database_unavailable",
      message:
        "Impossible de joindre la base de données. Vérifiez DATABASE_URL et que le serveur SQL est démarré.",
      shortMessage: "Base de données injoignable",
    };
  }

  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (["P1001", "P1002", "P1003", "P1017"].includes(e.code)) {
      return {
        code: "database_unavailable",
        message: "La base de données est injoignable ou n'existe pas.",
        shortMessage: "Base de données injoignable",
      };
    }
    if (e.code === "P2021") {
      return schemaOutOfDate("Une table attendue par l'application est absente de la base.");
    }
    if (e.code === "P2022") {
      return schemaOutOfDate("Une colonne attendue par l'application est absente de la base.");
    }
    return {
      code: `prisma_${e.code}`,
      message: e.message,
      shortMessage: e.message.slice(0, 240),
    };
  }

  if (
    e instanceof Prisma.PrismaClientUnknownRequestError ||
    e instanceof Prisma.PrismaClientRustPanicError
  ) {
    return {
      code: "database_error",
      message: "Erreur du moteur de base de données.",
      shortMessage: "Erreur moteur base de données",
    };
  }

  if (e instanceof Prisma.PrismaClientValidationError) {
    const msg = e.message;
    if (/does not exist/i.test(msg) || /column/i.test(msg)) {
      return schemaOutOfDate();
    }
    return {
      code: "database_validation_error",
      message: "Requête base de données invalide.",
      shortMessage: "Requête base invalide",
    };
  }

  if (e instanceof Error) {
    if (/does not exist/i.test(e.message)) {
      return schemaOutOfDate();
    }
    return {
      code: "error",
      message: e.message,
      shortMessage: e.message.slice(0, 240),
    };
  }

  const text = String(e);
  return {
    code: "error",
    message: text,
    shortMessage: text.slice(0, 240),
  };
}
