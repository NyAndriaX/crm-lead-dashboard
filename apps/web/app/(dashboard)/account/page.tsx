"use client";

import { Space, Typography } from "antd";
import { UserOutlined } from "@ant-design/icons";
import { ProfileSection } from "@/components/account/ProfileSection";
import { useIsMobile } from "@/lib/responsive";
import { ADMIN_HERO_GRADIENT } from "@/lib/pageUi";

const { Title, Text } = Typography;

export default function AccountPage() {
  const isMobile = useIsMobile();

  return (
    <Space direction="vertical" size={24} style={{ width: "100%" }}>
      <div
        className="page-hero"
        style={{
          background: ADMIN_HERO_GRADIENT,
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
            Profil et informations personnelles
          </Text>
        </div>
      </div>

      <ProfileSection />
    </Space>
  );
}
