import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Monorepo : tracer les fichiers depuis la racine du repo (pour la sortie standalone).
  outputFileTracingRoot: path.join(__dirname, "../../"),
  // Le client Prisma vit dans le package workspace @crm/db (source TypeScript).
  transpilePackages: ["@crm/db", "@crm/queue"],
  serverExternalPackages: [],
  experimental: {
    optimizePackageImports: ["antd", "@ant-design/icons"],
  },
};

export default nextConfig;
