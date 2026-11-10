import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ThemeProvider } from "@/components/ThemeProvider";
import { THEME_COOKIE, type ThemeMode } from "@/lib/theme";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

// Polices auto-hébergées par next/font : pas de requête vers Google depuis le navigateur.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter", display: "swap" });
const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-grotesk", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "CRM Lead — Prospection B2B augmentée par l'IA",
  description: "Collecte, qualification et prospection de leads B2B, assistées par l'intelligence artificielle.",
};

export async function generateViewport(): Promise<Viewport> {
  const mode = (await cookies()).get(THEME_COOKIE)?.value === "light" ? "light" : "dark";
  return { themeColor: mode === "dark" ? "#060913" : "#f3f5fb" };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Mode mémorisé dans un cookie : rendu serveur directement dans le bon thème (pas de flash).
  const mode: ThemeMode = (await cookies()).get(THEME_COOKIE)?.value === "light" ? "light" : "dark";

  return (
    <html lang="fr" data-theme={mode} className={`${inter.variable} ${grotesk.variable} ${mono.variable}`}>
      <body>
        <div className="nb-backdrop" aria-hidden>
          <div className="nb-grid" />
          <div className="nb-orb" />
        </div>
        <div className="nb-app">
          <AntdRegistry>
            <ThemeProvider initialMode={mode}>{children}</ThemeProvider>
          </AntdRegistry>
        </div>
      </body>
    </html>
  );
}
