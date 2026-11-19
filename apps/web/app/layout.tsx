import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ThemeProvider } from "@/components/ThemeProvider";
import { THEME_COOKIE, type ThemeMode } from "@/lib/theme";
import localFont from "next/font/local";
import "./globals.css";

// Polices embarquées dans le dépôt (app/fonts, fichiers variables) : ni le navigateur ni la compilation
// ne dépendent de Google Fonts.
const inter = localFont({ src: "./fonts/inter-latin-wght-normal.woff2", weight: "100 900", variable: "--font-inter", display: "swap" });
const grotesk = localFont({ src: "./fonts/space-grotesk-latin-wght-normal.woff2", weight: "300 700", variable: "--font-grotesk", display: "swap" });
const mono = localFont({ src: "./fonts/jetbrains-mono-latin-wght-normal.woff2", weight: "100 800", variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: "CRM Lead — Prospection B2B augmentée par l'IA",
  description: "Collecte, qualification et prospection de leads B2B, assistées par l'intelligence artificielle.",
};

export async function generateViewport(): Promise<Viewport> {
  const mode = (await cookies()).get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";
  return { themeColor: mode === "dark" ? "#060913" : "#f3f5fb" };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Mode mémorisé dans un cookie (clair par défaut) : rendu serveur directement dans le bon thème (pas de flash).
  const mode: ThemeMode = (await cookies()).get(THEME_COOKIE)?.value === "dark" ? "dark" : "light";

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
