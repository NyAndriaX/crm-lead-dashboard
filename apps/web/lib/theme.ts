import type { ThemeConfig } from "antd";
import { theme } from "antd";

/**
 * Design tokens du CRM Lead Dashboard (à valider en S1 — cf. CRM-010).
 * Source de vérité unique pour les couleurs / radius / typo.
 */
export const crmTheme: ThemeConfig = {
  token: {
    colorPrimary: "#1677ff", // bleu CRM
    colorSuccess: "#52c41a",
    colorWarning: "#faad14",
    colorError: "#ff4d4f",
    borderRadius: 8,
    fontFamily:
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, system-ui, sans-serif",
  },
  algorithm: theme.defaultAlgorithm, // basculer sur theme.darkAlgorithm pour le mode sombre
  components: {
    Layout: {
      headerBg: "#ffffff",
      siderBg: "#001529",
    },
  },
};
