"use client";

import { AntdRegistry } from "@ant-design/nextjs-registry";
import { App, ConfigProvider } from "antd";
import frFR from "antd/locale/fr_FR";
import { useEffect } from "react";
import { bindFeedbackMessage } from "@/lib/feedback";
import { crmTheme } from "@/lib/theme";

function FeedbackBinder({ children }: { children: React.ReactNode }) {
  const { message: msg } = App.useApp();
  useEffect(() => {
    bindFeedbackMessage(msg);
    return () => bindFeedbackMessage(null);
  }, [msg]);
  return children;
}

/** ConfigProvider + App Ant Design (requis pour les toasts `message` via App.useApp). */
export function AntdAppProvider({ children }: { children: React.ReactNode }) {
  return (
    <AntdRegistry>
      <ConfigProvider theme={crmTheme} locale={frFR}>
        <App>
          <FeedbackBinder>{children}</FeedbackBinder>
        </App>
      </ConfigProvider>
    </AntdRegistry>
  );
}
