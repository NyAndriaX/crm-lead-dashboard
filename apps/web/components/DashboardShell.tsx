"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Layout, Menu, Dropdown, Avatar, Space, Typography, theme as antdTheme, Badge, Divider, Tooltip,
} from "antd";
import {
  DashboardOutlined, TeamOutlined, ImportOutlined, MailOutlined, MessageOutlined,
  RetweetOutlined, ProjectOutlined, BarChartOutlined, SettingOutlined,
  UserOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  BellOutlined, HomeOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";
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

// ── Navigation groupée ────────────────────────────────────────────────────────

function buildNav(role: ShellUser["role"], collapsed: boolean): MenuProps["items"] {
  const isAdmin = role === "ADMIN";
  const isManager = role === "ADMIN" || role === "MANAGER";

  const groups: MenuProps["items"] = [
    // ── Accueil ──────────────────────────────────────────────────────────
    {
      key: "/dashboard",
      icon: <HomeOutlined />,
      label: <Link href="/dashboard">Tableau de bord</Link>,
    },

    // ── Séparateur ───────────────────────────────────────────────────────
    { type: "divider" },

    // ── Prospection ──────────────────────────────────────────────────────
    ...(collapsed ? [] : [{ type: "group" as const, label: <span style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", opacity: 0.5 }}>Prospection</span>, children: [] }]),

    {
      key: "/leads",
      icon: <TeamOutlined />,
      label: <Link href="/leads">Leads</Link>,
    },
    {
      key: "/import",
      icon: <ImportOutlined />,
      label: <Link href="/import">Import</Link>,
    },

    // ── Séparateur ───────────────────────────────────────────────────────
    { type: "divider" },

    // ── Communication ────────────────────────────────────────────────────
    ...(collapsed ? [] : [{ type: "group" as const, label: <span style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", opacity: 0.5 }}>Communication</span>, children: [] }]),

    {
      key: "/campaigns",
      icon: <MailOutlined />,
      label: <Link href="/campaigns">Emailing</Link>,
    },
    {
      key: "/inbox",
      icon: <MessageOutlined />,
      label: <Link href="/inbox">Réponses</Link>,
    },
    {
      key: "/sequences",
      icon: <RetweetOutlined />,
      label: <Link href="/sequences">Relances</Link>,
    },

    // ── Séparateur ───────────────────────────────────────────────────────
    { type: "divider" },

    // ── Gestion ──────────────────────────────────────────────────────────
    ...(collapsed ? [] : [{ type: "group" as const, label: <span style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", opacity: 0.5 }}>Gestion</span>, children: [] }]),

    {
      key: "/pipeline",
      icon: <ProjectOutlined />,
      label: <Link href="/pipeline">Pipeline</Link>,
    },
    {
      key: "/analytics",
      icon: <BarChartOutlined />,
      label: <Link href="/analytics">Analytics</Link>,
    },

    // ── Administration (Admin/Manager uniquement) ─────────────────────────
    ...(isManager ? [
      { type: "divider" as const },
      ...(collapsed ? [] : [{ type: "group" as const, label: <span style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", opacity: 0.5 }}>Administration</span>, children: [] }]),
      {
        key: "/settings",
        icon: <SettingOutlined />,
        label: <Link href="/settings">Configuration</Link>,
        style: isAdmin ? {} : {},
      },
    ] : []),
  ];

  return groups;
}

// ── Shell principal ───────────────────────────────────────────────────────────

export default function DashboardShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const { token } = antdTheme.useToken();

  const selectedKey = (
    pathname.startsWith("/settings") ? "/settings" :
    pathname.startsWith("/leads") ? "/leads" :
    pathname.startsWith("/import") ? "/import" :
    pathname.startsWith("/campaigns") ? "/campaigns" :
    pathname.startsWith("/inbox") ? "/inbox" :
    pathname.startsWith("/sequences") ? "/sequences" :
    pathname.startsWith("/pipeline") ? "/pipeline" :
    pathname.startsWith("/analytics") ? "/analytics" :
    "/dashboard"
  );

  async function logout() {
    try { await api.post("/auth/logout"); } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const initials = user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <Layout style={{ minHeight: "100vh" }}>

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        trigger={null}
        width={220}
        style={{
          boxShadow: "2px 0 8px rgba(0,0,0,0.06)",
          overflow: "auto",
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        {/* Logo */}
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
          {!collapsed && (
            <Text
              strong
              style={{
                color: "#fff", marginLeft: 10, fontSize: 14,
                letterSpacing: 0.3,
              }}
            >
              CRM Dashboard
            </Text>
          )}
        </div>

        {/* Menu */}
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={buildNav(user.role, collapsed)}
          style={{ border: "none", paddingTop: 8 }}
        />

        {/* User info en bas */}
        {!collapsed && (
          <div
            style={{
              position: "absolute", bottom: 48, left: 0, right: 0,
              padding: "12px 16px",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(0,0,0,0.15)",
            }}
          >
            <Space size={8} style={{ width: "100%" }}>
              <Avatar
                size={32}
                style={{ background: ROLE_COLORS[user.role], flexShrink: 0, fontSize: 12, fontWeight: 600 }}
              >
                {initials}
              </Avatar>
              <div style={{ overflow: "hidden" }}>
                <Text style={{ color: "#fff", fontSize: 12, fontWeight: 600, display: "block" }} ellipsis>
                  {user.name}
                </Text>
                <span
                  style={{
                    fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 4,
                    background: ROLE_COLORS[user.role] + "33",
                    color: ROLE_COLORS[user.role],
                    letterSpacing: 0.3,
                  }}
                >
                  {ROLE_LABELS[user.role]}
                </span>
              </div>
            </Space>
          </div>
        )}
      </Sider>

      <Layout>
        {/* ── Header ────────────────────────────────────────────────────── */}
        <Header
          style={{
            padding: "0 24px",
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
          {/* Bouton fold/unfold */}
          <div
            onClick={() => setCollapsed(!collapsed)}
            style={{ cursor: "pointer", fontSize: 16, color: token.colorTextSecondary, padding: "4px 8px", borderRadius: 6 }}
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </div>

          {/* Actions droite */}
          <Space size={8}>
            <Tooltip title="Notifications (à venir)">
              <Badge count={0} dot>
                <div
                  style={{
                    width: 36, height: 36, borderRadius: 8, border: `1px solid ${token.colorBorderSecondary}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", color: token.colorTextSecondary,
                  }}
                >
                  <BellOutlined />
                </div>
              </Badge>
            </Tooltip>

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
                  { key: "logout", icon: <LogoutOutlined />, label: "Déconnexion", danger: true, onClick: logout },
                ],
              }}
              trigger={["click"]}
              placement="bottomRight"
            >
              <Space style={{ cursor: "pointer" }} size={8}>
                <Avatar
                  size={34}
                  style={{ background: ROLE_COLORS[user.role], fontSize: 12, fontWeight: 600 }}
                >
                  {initials}
                </Avatar>
                <div style={{ lineHeight: 1.3 }}>
                  <Text strong style={{ fontSize: 13, display: "block" }}>{user.name.split(" ")[0]}</Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>{ROLE_LABELS[user.role]}</Text>
                </div>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        {/* ── Contenu ───────────────────────────────────────────────────── */}
        <Content
          style={{
            margin: 24,
            minHeight: "calc(100vh - 56px - 48px)",
          }}
        >
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}
