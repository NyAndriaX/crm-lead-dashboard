/**
 * Catalogue des fournisseurs d'IA proposés à l'administrateur (Configuration › Intelligence artificielle).
 * Fichier sans dépendance Node : importable côté navigateur (`@crm/ai/providers`).
 *
 *  - `skills` : Claude, exécuté via les Claude Skills et le CLI Claude Code (pas de choix de modèle :
 *    chaque tâche est un skill versionné ; authentification par jeton CLAUDE_CODE_OAUTH_TOKEN).
 *  - `openai-compatible` : API Chat Completions (OpenAI, DeepSeek, Mistral, Gemini, Ollama…). Les mêmes
 *    fichiers SKILL.md servent d'instructions : le métier est écrit une fois, le moteur se change d'un clic.
 */
export type AiProviderId = "claude-skills" | "openai" | "deepseek" | "mistral" | "gemini" | "ollama" | "openai-compatible";

export type AiProvider = {
  id: AiProviderId;
  label: string;
  vendor: string;
  kind: "skills" | "openai-compatible";
  description: string;
  /** Point d'accès par défaut (API Chat Completions). */
  baseUrl?: string;
  /** L'utilisateur peut / doit saisir le point d'accès. */
  editableBaseUrl?: boolean;
  /** Une clé d'API est nécessaire (sinon facultative). */
  needsKey: boolean;
  keyLabel: string;
  keyHint?: string;
  /** Suggestions de modèles (saisie libre possible). */
  models: string[];
  defaultModel?: string;
  defaultFastModel?: string;
  /** Mode JSON pris en charge par l'API : schéma strict ou simple objet JSON. */
  jsonMode?: "json_schema" | "json_object";
};

export const AI_PROVIDERS: AiProvider[] = [
  {
    id: "claude-skills",
    label: "Claude (Claude Skills)",
    vendor: "Anthropic",
    kind: "skills",
    description: "Chaque tâche est un skill versionné, exécuté par le CLI Claude Code avec l'abonnement Claude. Aucun modèle à choisir.",
    needsKey: false,
    keyLabel: "Jeton CLAUDE_CODE_OAUTH_TOKEN",
    keyHint: "Généré par « claude setup-token ». Laissez vide pour utiliser la session du serveur.",
    models: [],
  },
  {
    id: "openai",
    label: "OpenAI (ChatGPT)",
    vendor: "OpenAI",
    kind: "openai-compatible",
    description: "Modèles GPT via l'API OpenAI. Sorties validées par schéma JSON strict.",
    baseUrl: "https://api.openai.com/v1",
    needsKey: true,
    keyLabel: "Clé d'API OpenAI",
    keyHint: "Commence par « sk- ». Créée sur platform.openai.com.",
    models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"],
    defaultModel: "gpt-4o",
    defaultFastModel: "gpt-4o-mini",
    jsonMode: "json_schema",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    vendor: "DeepSeek",
    kind: "openai-compatible",
    description: "Modèles DeepSeek, économiques, via une API compatible OpenAI.",
    baseUrl: "https://api.deepseek.com/v1",
    needsKey: true,
    keyLabel: "Clé d'API DeepSeek",
    keyHint: "Créée sur platform.deepseek.com.",
    models: ["deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-chat",
    defaultFastModel: "deepseek-chat",
    jsonMode: "json_object",
  },
  {
    id: "mistral",
    label: "Mistral AI",
    vendor: "Mistral AI",
    kind: "openai-compatible",
    description: "Modèles européens Mistral (hébergement en Europe).",
    baseUrl: "https://api.mistral.ai/v1",
    needsKey: true,
    keyLabel: "Clé d'API Mistral",
    keyHint: "Créée sur console.mistral.ai.",
    models: ["mistral-small-latest", "mistral-large-latest"],
    defaultModel: "mistral-large-latest",
    defaultFastModel: "mistral-small-latest",
    jsonMode: "json_object",
  },
  {
    id: "gemini",
    label: "Google Gemini",
    vendor: "Google",
    kind: "openai-compatible",
    description: "Modèles Gemini via le point d'accès compatible OpenAI de Google.",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    needsKey: true,
    keyLabel: "Clé d'API Google AI Studio",
    keyHint: "Créée sur aistudio.google.com.",
    models: ["gemini-2.0-flash", "gemini-1.5-pro"],
    defaultModel: "gemini-2.0-flash",
    defaultFastModel: "gemini-2.0-flash",
    jsonMode: "json_object",
  },
  {
    id: "ollama",
    label: "Ollama (modèle local)",
    vendor: "Ollama",
    kind: "openai-compatible",
    description: "Modèle open source exécuté sur votre propre serveur : aucune donnée ne quitte l'infrastructure.",
    baseUrl: "http://localhost:11434/v1",
    editableBaseUrl: true,
    needsKey: false,
    keyLabel: "Clé d'API (facultative)",
    models: ["llama3.1", "qwen2.5", "mistral"],
    defaultModel: "llama3.1",
    jsonMode: "json_object",
  },
  {
    id: "openai-compatible",
    label: "Autre service compatible OpenAI",
    vendor: "Personnalisé",
    kind: "openai-compatible",
    description: "Tout service exposant l'API Chat Completions (Azure OpenAI, OpenRouter, vLLM, LM Studio…).",
    editableBaseUrl: true,
    needsKey: false,
    keyLabel: "Clé d'API",
    models: [],
    jsonMode: "json_object",
  },
];

export function getProvider(id: string | null | undefined): AiProvider | null {
  return AI_PROVIDERS.find((p) => p.id === id) ?? null;
}
