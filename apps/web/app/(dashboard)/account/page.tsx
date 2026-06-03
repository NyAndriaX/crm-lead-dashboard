"use client";

import { Space, Typography } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { OpenAiSection } from "@/components/account/OpenAiSection";
import { useIsMobile } from "@/lib/responsive";

const { Title, Text } = Typography;

export default function AccountPage() {
  const isMobile = useIsMobile();

  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <div
        className="page-hero"
        style={{
          background: "linear-gradient(135deg,#531dab 0%,#391085 100%)",
          alignItems: "center",
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 14,
            background: "rgba(255,255,255,0.15)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 24,
            color: "#fff",
          }}
        >
          <UserOutlined />
        </div>
        <div>
          <Title level={isMobile ? 4 : 3} style={{ color: "#fff", margin: 0 }}>
            Mon compte
          </Title>
          <Text style={{ color: "rgba(255,255,255,0.75)" }}>
            Paramètres personnels et intégrations
          </Text>
        </div>
      </div>

      <OpenAiSection />
    </Space>
  );
}
