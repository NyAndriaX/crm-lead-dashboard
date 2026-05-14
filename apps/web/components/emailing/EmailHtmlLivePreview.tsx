"use client";

import { useState } from "react";
import { Card, Segmented, Space } from "antd";
import { DesktopOutlined, MobileOutlined } from "@ant-design/icons";

export function EmailHtmlLivePreview({
  html,
  emptyHtml,
  minHeight = 320,
  maxHeight = 440,
}: {
  html: string;
  emptyHtml: string;
  minHeight?: number;
  maxHeight?: number;
}) {
  const [layout, setLayout] = useState<"desktop" | "mobile">("desktop");
  const inner = typeof html === "string" && html.trim() ? html : emptyHtml;
  const narrow = layout === "mobile";

  return (
    <Space direction="vertical" size={10} style={{ width: "100%" }}>
      <Segmented
        value={layout}
        onChange={(v) => setLayout(v as "desktop" | "mobile")}
        options={[
          { label: (<Space size={4}><DesktopOutlined /><span>Desktop</span></Space>), value: "desktop" },
          { label: (<Space size={4}><MobileOutlined /><span>Mobile</span></Space>), value: "mobile" },
        ]}
      />
      <Card
        size="small"
        styles={{ body: { padding: 0 } }}
        style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #f0f0f0" }}
      >
        <div
          style={{
            background: narrow ? "#e8e8e8" : "#fafafa",
            padding: narrow ? "12px 0" : 12,
            display: "flex",
            justifyContent: "center",
            minHeight,
            maxHeight,
            overflow: "auto",
          }}
        >
          <div
            style={{
              width: narrow ? 375 : "100%",
              maxWidth: "100%",
              minHeight: narrow ? minHeight - 24 : minHeight - 24,
              background: "#fff",
              borderRadius: narrow ? 12 : 6,
              boxShadow: narrow ? "0 2px 12px rgba(0,0,0,0.12)" : undefined,
              padding: 12,
              overflow: "auto",
            }}
          >
            <div dangerouslySetInnerHTML={{ __html: inner }} />
          </div>
        </div>
      </Card>
    </Space>
  );
}
