"use client";

import { Result } from "antd";

/** Page d’attente pour un module non encore livré — libellés produit uniquement (pas de codes internes). */
export default function ModulePlaceholder({
  title,
  description,
}: {
  title: string;
  /** Phrase optionnelle expliquant la valeur métier attendue. */
  description?: string;
}) {
  return (
    <Result
      status="info"
      title={title}
      subTitle={
        description ??
        "Cette fonctionnalité est en cours de conception. L’application (authentification, données, sécurité) reste pleinement opérationnelle sur les modules déjà livrés."
      }
    />
  );
}
