import type { Metadata } from "next";
import { AntdAppProvider } from "@/components/AntdAppProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "CRM Lead Dashboard",
  description: "Gestion, qualification et prospection de leads",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body>
        <AntdAppProvider>{children}</AntdAppProvider>
      </body>
    </html>
  );
}
