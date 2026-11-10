import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pas de badge Next.js en développement (démos, captures d'écran) ; les erreurs restent affichées.
  devIndicators: false,
  output: "standalone",
  // Monorepo : tracer les fichiers depuis la racine du repo (pour la sortie standalone).
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Packages workspace consommés en source TypeScript (client Prisma, file, IA, tâches de fond).
  transpilePackages: ["@crm/ai", "@crm/db", "@crm/jobs", "@crm/queue"],
  // Libs Node des tâches de fond (IMAP / parsing mail) : chargées via require(), pas bundlées.
  serverExternalPackages: ["imapflow", "mailparser"],
  experimental: {
    optimizePackageImports: ["antd", "@ant-design/icons"],
  },
};

export default nextConfig;
