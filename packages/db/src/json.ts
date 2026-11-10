/**
 * Lecture typée des colonnes JSON contenant une liste de chaînes
 * (Lead.tags, Template.variables, TemplateBlock.variables, WebhookOut.events).
 */
export function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}
