import { message } from "antd";
import type { MessageInstance } from "antd/es/message/interface";
import type { FormInstance } from "antd/es/form";

let messageApi: MessageInstance | null = null;

/** Branche les toasts sur `App.useApp().message` (recommandé en React 18 / Next.js). */
export function bindFeedbackMessage(api: MessageInstance | null) {
  messageApi = api;
}

function getMessage(): MessageInstance {
  return messageApi ?? message;
}

function formatToast(title: string, detail?: string): string {
  if (!detail || detail === title) return title;
  if (title === "Erreur") return detail;
  return `${title} — ${detail}`;
}

/** Erreur Ant Design Form (validateFields) — ne pas afficher de toast en double. */
export function isFormValidationError(e: unknown): boolean {
  const fields = (e as { errorFields?: unknown[] })?.errorFields;
  return Array.isArray(fields) && fields.length > 0;
}

const ERROR_TITLES: Record<string, string> = {
  duplicate_email: "Email déjà utilisé",
  forbidden: "Accès refusé",
  not_found: "Élément introuvable",
  validation_error: "Données invalides",
  unauthenticated: "Session expirée",
  email_blocked: "Contact bloqué (RGPD)",
};

const ERROR_HINTS: Record<string, string> = {
  duplicate_email:
    "Modifiez l'adresse ou ouvrez le lead existant depuis la liste.",
};

/** Code erreur API (`error` dans le JSON). */
export function extractApiErrorCode(e: unknown): string | undefined {
  return (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
}

export function isDuplicateEmailError(e: unknown): boolean {
  return extractApiErrorCode(e) === "duplicate_email";
}

/** Titre selon le code erreur API (`error` dans le JSON). */
export function extractApiErrorTitle(e: unknown, fallback = "Erreur"): string {
  const code = extractApiErrorCode(e);
  if (code) {
    const titled = ERROR_TITLES[code];
    if (titled) return titled;
  }
  return fallback;
}

/** Extrait un message lisible depuis une erreur API (Zod, ApiError, etc.). */
export function extractApiError(e: unknown, fallback = "Erreur"): string {
  const data = (e as {
    response?: {
      data?: {
        message?: string;
        error?: string;
        details?: {
          fieldErrors?: Record<string, string[]>;
          formErrors?: string[];
        };
      };
    };
  }).response?.data;

  if (!data) {
    if (e instanceof Error && e.message && !isFormValidationError(e)) {
      return e.message;
    }
    return fallback;
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

/** Met en évidence le champ concerné (ex. email en doublon). */
export function applyApiFieldErrors(
  e: unknown,
  form: FormInstance,
  fieldByCode: Record<string, string | string[]> = { duplicate_email: "email" },
): boolean {
  const code = extractApiErrorCode(e);
  if (!code) return false;
  const mapping = fieldByCode[code];
  if (!mapping) return false;
  const fieldMessage = extractApiError(e);
  const names = Array.isArray(mapping) ? mapping : [mapping];
  form.setFields(names.map((name) => ({ name, errors: [fieldMessage] })));
  return true;
}

/** @deprecated Alias — utilise `notifySuccess`. */
export function showSuccessPopup(title: string, content?: string) {
  notifySuccess(title, content);
}

/** @deprecated Alias — utilise `notifyError`. */
export function showErrorPopup(title: string, content?: string) {
  notifyError(content ?? title, title);
}

/** @deprecated Alias — utilise `notifyWarning`. */
export function showWarningPopup(title: string, content?: string) {
  notifyWarning(title, content);
}

/** @deprecated Alias — utilise `notifyInfo`. */
export function showInfoPopup(title: string, content?: string) {
  notifyInfo(title, content);
}

/** Succès utilisateur — toast Ant Design. */
export function notifySuccess(title: string, content?: string) {
  getMessage().success(formatToast(title, content));
}

export function notifyWarning(title: string, content?: string) {
  getMessage().warning(formatToast(title, content));
}

export function notifyInfo(title: string, content?: string) {
  getMessage().info(formatToast(title, content));
}

/**
 * Erreur API ou réseau — toast avec message serveur si disponible.
 * Ignore les erreurs de validation de formulaire (champs en rouge).
 */
export function notifyApiError(
  e: unknown,
  fallback = "Une erreur est survenue",
  title?: string,
) {
  if (isFormValidationError(e)) return;
  const code = extractApiErrorCode(e);
  const resolvedTitle = title ?? extractApiErrorTitle(e);
  const detail = extractApiError(e, fallback);
  const hint = code ? ERROR_HINTS[code] : undefined;
  const text = formatToast(resolvedTitle, hint ? `${detail} ${hint}` : detail);
  getMessage().error({ content: text, duration: 5 });
}

/** Message d'erreur simple (sans objet Error). */
export function notifyError(detail: string, title = "Erreur") {
  getMessage().error(formatToast(title, detail));
}
