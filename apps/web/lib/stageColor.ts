import { palette } from "@/lib/theme";

/**
 * Couleurs d'étapes de pipeline : les anciennes couleurs Ant Design (seed historique,
 * bases existantes) sont converties vers la palette Nebula ; une couleur personnalisée
 * choisie dans Configuration est conservée telle quelle.
 */
const LEGACY: Record<string, string> = {
  "#8c8c8c": palette.blue,
  "#595959": palette.blue,
  "#8b5cf6": palette.cyan,
  "#a78bfa": palette.violet,
  "#722ed1": palette.pink,
  "#fbbf24": palette.amber,
  "#34d399": palette.green,
  "#ff4d4f": palette.red,
  "#f5222d": palette.red,
  "#eb2f96": palette.pink,
};

export const STAGE_PALETTE = [palette.blue, palette.cyan, palette.violet, palette.pink, palette.amber, palette.green, palette.red, palette.indigo];

export function stageColor(color: string | null | undefined, index = 0): string {
  if (!color) return STAGE_PALETTE[index % STAGE_PALETTE.length]!;
  return LEGACY[color.toLowerCase()] ?? color;
}
