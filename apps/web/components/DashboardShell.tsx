"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Layout, Menu, Dropdown, Avatar, Space, Typography, theme as antdTheme } from "antd";
import {
  TeamOutlined, ImportOutlined, MailOutlined, MessageOutlined, RetweetOutlined,
  ProjectOutlined, BarChartOutlined, SettingOutlined, UserOutlined, LogoutOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export interface ShellUser {
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "COMMERCIAL" | "LECTEUR";
}

// Navigation du dashboard — alignée sur les 10 modules du CDC
// (le module Scraping est masqué tant que le service Python n'est pas livré).
const NAV = [
  { key: "/leads", icon: <TeamOutlined />, label: <Link href="/leads">Leads</Link> },
  { key: "/import", icon: <ImportOutlined />, label: <Link href="/import">Import</Link> },
  { key: "/campaigns", icon: <MailOutlined />, label: <Link href="/campaigns">Emailing</Link> },
  { key: "/inbox", icon: <MessageOutlined />, label: <Link href="/inbox">Réponses</Link> },
  { key: "/sequences", icon: <RetweetOutlined />, label: <Link href="/sequences">Relances</Link> },
  { key: "/pipeline", icon: <ProjectOutlined />, label: <Link href="/pipeline">Pipeline</Link> },
  { key: "/analytics", icon: <BarChartOutlined />, label: <Link href="/analytics">Analytics</Link> },
  { key: "/settings", icon: <SettingOutlined />, label: <Link href="/settings">Configuration</Link> },
];

export default function DashboardShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { token } = antdTheme.useToken();

  const selectedKey = NAV.find((n) => pathname.startsWith(n.key))?.key ?? "/leads";

  async function logout() {
    try {
      await api.post("/auth/logout");
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider collapsible collapsed={collapsed} onCollapse={setCollapsed}>
        <div
          style={{
            height: 48, margin: 16, color: "#fff", fontWeight: 700, fontSize: collapsed ? 14 : 16,
            display: "flex", alignItems: "center", justifyContent: "center", whiteSpace: "nowrap", overflow: "hidden",
          }}
        >
          {collapsed ? "CRM" : "CRM Lead Dashboard"}
        </div>
        <Menu theme="dark" mode="inline" selectedKeys={[selectedKey]} items={NAV} />
      </Sider>
      <Layout>
        <Header
          style={{
            padding: "0 24px", background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            display: "flex", alignItems: "center", justifyContent: "flex-end",
          }}
        >
          <Dropdown
            menu={{
              items: [
                { key: "email", label: <Text type="secondary">{user.email}</Text>, disabled: true },
                { key: "role", label: <Text type="secondary">Rôle : {user.role}</Text>, disabled: true },
                { type: "divider" },
                { key: "logout", icon: <LogoutOutlined />, label: "Déconnexion", onClick: logout },
              ],
            }}
          >
            <Space style={{ cursor: "pointer" }}>
              <Avatar size="small" icon={<UserOutlined />} />
              <span>{user.name}</span>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ margin: 24 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
