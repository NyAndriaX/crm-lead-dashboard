import { Modal } from "antd";

/** Extrait un message lisible depuis une erreur API (Zod, ApiError, etc.). */
export function extractApiError(e: unknown, fallback = "Erreur"): string {
  const data = (e as {
    response?: {
      data?: {
        message?: string;
        details?: {
          fieldErrors?: Record<string, string[]>;
          formErrors?: string[];
        };
      };
    };
  }).response?.data;

  if (!data) {
    return e instanceof Error ? e.message : fallback;
  }

  const parts: string[] = [];
  if (data.message) parts.push(data.message);
  const fieldErrors = data.details?.fieldErrors;
  if (fieldErrors) {
    for (const [field, errors] of Object.entries(fieldErrors)) {
      if (errors?.length) parts.push(`${field}: ${errors.join(", ")}`);
    }
  }
  if (data.details?.formErrors?.length) {
    parts.push(...data.details.formErrors);
  }
  return parts.length > 0 ? parts.join(" — ") : fallback;
}

export function showSuccessPopup(title: string, content?: string) {
  Modal.success({ title, content, centered: true, okText: "OK" });
}

export function showErrorPopup(title: string, content?: string) {
  Modal.error({ title, content, centered: true, okText: "Fermer" });
}

export function showWarningPopup(title: string, content?: string) {
  Modal.warning({ title, content, centered: true, okText: "OK" });
}
