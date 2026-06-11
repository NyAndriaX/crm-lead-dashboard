"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Layout, Menu, Dropdown, Avatar, Space, Typography, theme as antdTheme, Divider, Drawer,
} from "antd";
import {
  DashboardOutlined, TeamOutlined, ImportOutlined, MailOutlined, MessageOutlined,
  RetweetOutlined, ProjectOutlined, BarChartOutlined, SettingOutlined,
  LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  HomeOutlined, RadarChartOutlined,
  UserOutlined, ThunderboltOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";
import { useBreakpoint, useIsMobile } from "@/lib/responsive";
import { NotificationsBell } from "@/components/NotificationsBell";
import type { MenuProps } from "antd";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export interface ShellUser {
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "COMMERCIAL" | "LECTEUR";
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "#ff4d4f", MANAGER: "#fa8c16", COMMERCIAL: "#1677ff", LECTEUR: "#8c8c8c",
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur", MANAGER: "Manager", COMMERCIAL: "Commercial", LECTEUR: "Lecteur",
};

function buildNav(role: ShellUser["role"], collapsed: boolean): MenuProps["items"] {
  const isManager = role === "ADMIN" || role === "MANAGER";

  return [
    {
      key: "/dashboard",
      icon: <HomeOutlined />,
      label: <Link href="/dashboard">Tableau de bord</Link>,
    },
    { type: "divider" },
    ...(collapsed ? [] : [{ type: "group" as const, label: <span style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", opacity: 0.5 }}>Prospection</span>, children: [] }]),
    { key: "/leads", icon: <TeamOutlined />, label: <Link href="/leads">Leads</Link> },
    { key: "/import", icon: <ImportOutlined />, label: <Link href="/import">Import</Link> },
    { key: "/scraping", icon: <RadarChartOutlined />, label: <Link href="/scraping">Scraping</Link> },
    { type: "divider" },
    ...(collapsed ? [] : [{ type: "group" as const, label: <span style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", opacity: 0.5 }}>Communication</span>, children: [] }]),
    { key: "/campaigns", icon: <MailOutlined />, label: <Link href="/campaigns">Emailing</Link> },
    { key: "/inbox", icon: <MessageOutlined />, label: <Link href="/inbox">Réponses</Link> },
    { key: "/sequences", icon: <RetweetOutlined />, label: <Link href="/sequences">Relances</Link> },
    { type: "divider" },
    ...(collapsed ? [] : [{ type: "group" as const, label: <span style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", opacity: 0.5 }}>Commercial</span>, children: [] }]),
    { key: "/pipeline", icon: <ProjectOutlined />, label: <Link href="/pipeline">Pipeline</Link> },
    { key: "/analytics", icon: <BarChartOutlined />, label: <Link href="/analytics">Analytics</Link> },
    ...(isManager ? [
      { type: "divider" as const },
      ...(collapsed ? [] : [{ type: "group" as const, label: <span style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", opacity: 0.5 }}>Administration</span>, children: [] }]),
      { key: "/settings", icon: <SettingOutlined />, label: <Link href="/settings">Configuration</Link> },
    ] : []),
  ];
}


type Branding = { siteName?: string; siteIconUrl?: string };

export default function DashboardShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [branding, setBranding] = useState<Branding>({});
  const pathname = usePathname();
  const router = useRouter();
  const { token } = antdTheme.useToken();
  const screens = useBreakpoint();
  const isMobile = useIsMobile();

  const selectedKey = (
    pathname.startsWith("/settings") ? "/settings" :
    pathname.startsWith("/account") ? "/account" :
    pathname.startsWith("/leads") ? "/leads" :
    pathname.startsWith("/import") ? "/import" :
    pathname.startsWith("/scraping") ? "/scraping" :
    pathname.startsWith("/campaigns") ? "/campaigns" :
    pathname.startsWith("/inbox") ? "/inbox" :
    pathname.startsWith("/sequences") ? "/sequences" :
    pathname.startsWith("/pipeline") ? "/pipeline" :
    pathname.startsWith("/analytics") ? "/analytics" :
    "/dashboard"
  );

  useEffect(() => {
    fetch("/api/organization/branding")
      .then((r) => r.json())
      .then((j: { data?: Branding }) => setBranding(j.data ?? {}))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!isMobile) setDrawerOpen(false);
  }, [isMobile]);

  async function logout() {
    try { await api.post("/auth/logout"); } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const initials = user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const navItems = buildNav(user.role, isMobile ? false : collapsed);
  const contentMargin = isMobile ? 12 : 24;
  const headerPadding = isMobile ? "0 12px" : "0 24px";

  const menu = (
    <Menu
      theme="dark"
      mode="inline"
      selectedKeys={[selectedKey]}
      items={navItems}
      style={{ border: "none", paddingTop: 8 }}
      onClick={() => { if (isMobile) setDrawerOpen(false); }}
    />
  );

  return (
    <Layout style={{ minHeight: "100vh" }}>
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
          width={220}
          collapsedWidth={72}
          style={{
            boxShadow: "2px 0 8px rgba(0,0,0,0.06)",
            overflow: "auto",
            position: "sticky",
            top: 0,
            height: "100vh",
          }}
        >
          <div
            style={{
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: collapsed ? "center" : "flex-start",
              padding: collapsed ? "0" : "0 20px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            {branding.siteIconUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.siteIconUrl} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
            ) : (
              <div
                style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: "linear-gradient(135deg,#1677ff,#0950b3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <DashboardOutlined style={{ color: "#fff", fontSize: 14 }} />
              </div>
            )}
            {!collapsed && (
              <Text strong style={{ color: "#fff", marginLeft: 10, fontSize: 14, letterSpacing: 0.3 }}>
                {branding.siteName ?? "CRM Dashboard"}
              </Text>
            )}
          </div>
          {menu}
        </Sider>
      )}

      {isMobile && (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={280}
          styles={{ body: { padding: 0, background: "#001529" } }}
          title={null}
          closeIcon={null}
        >
          <div
            style={{
              height: 56,
              display: "flex",
              alignItems: "center",
              padding: "0 20px",
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Text strong style={{ color: "#fff", fontSize: 14 }}>CRM Dashboard</Text>
          </div>
          {menu}
        </Drawer>
      )}

      <Layout>
        <Header
          style={{
            padding: headerPadding,
            background: token.colorBgContainer,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "sticky",
            top: 0,
            zIndex: 100,
            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
          }}
        >
          <div
            onClick={() => (isMobile ? setDrawerOpen(true) : setCollapsed(!collapsed))}
            style={{ cursor: "pointer", fontSize: 16, color: token.colorTextSecondary, padding: "4px 8px", borderRadius: 6 }}
          >
            {isMobile || collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </div>

          <Space size={8}>
            <NotificationsBell
              borderColor={token.colorBorderSecondary}
              textColor={token.colorTextSecondary}
            />

            <Divider type="vertical" style={{ margin: "0 4px" }} />

            <Dropdown
              menu={{
                items: [
                  {
                    key: "profile",
                    label: (
                      <div style={{ padding: "4px 0" }}>
                        <Text strong style={{ display: "block" }}>{user.name}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{user.email}</Text>
                      </div>
                    ),
                    disabled: true,
                  },
                  {
                    key: "role",
                    label: (
                      <span
                        style={{
                          fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 4,
                          background: ROLE_COLORS[user.role] + "22",
                          color: ROLE_COLORS[user.role],
                        }}
                      >
                        {ROLE_LABELS[user.role]}
                      </span>
                    ),
                    disabled: true,
                  },
                  { type: "divider" },
                  {
                    key: "account",
                    icon: <UserOutlined />,
                    label: <Link href="/account">Mon profil</Link>,
                  },
                  ...(user.role !== "ADMIN" && user.role !== "MANAGER" ? [{
                    key: "openai",
                    icon: <ThunderboltOutlined />,
                    label: <Link href="/settings?tab=openai">Intégration IA</Link>,
                  }] : []),
                  { key: "logout", icon: <LogoutOutlined />, label: "Déconnexion", danger: true, onClick: logout },
                ],
              }}
              trigger={["click"]}
              placement="bottomRight"
            >
              <Space style={{ cursor: "pointer" }} size={8}>
                <Avatar size={34} style={{ background: ROLE_COLORS[user.role], fontSize: 12, fontWeight: 600 }}>
                  {initials}
                </Avatar>
                {!screens.xs && (
                  <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>{ROLE_LABELS[user.role]}</Text>
                )}
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content
          style={{
            margin: contentMargin,
            minHeight: "calc(100vh - 56px - 48px)",
            maxWidth: "100%",
            overflowX: "hidden",
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
