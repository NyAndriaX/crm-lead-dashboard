import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import { ConfigProvider } from "antd";
import frFR from "antd/locale/fr_FR";
import { crmTheme } from "@/lib/theme";
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
        <AntdRegistry>
          <ConfigProvider theme={crmTheme} locale={frFR}>
            {children}
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  );
}
