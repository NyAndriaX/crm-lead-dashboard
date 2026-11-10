"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Layout, Menu, Dropdown, Avatar, Typography, Drawer, Input, Tooltip } from "antd";
import {
  TeamOutlined, ImportOutlined, MailOutlined, MessageOutlined, RetweetOutlined, ProjectOutlined,
  BarChartOutlined, SettingOutlined, LogoutOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  HomeOutlined, RadarChartOutlined, SearchOutlined, MenuOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";
import { useIsMobile } from "@/lib/responsive";
import { NotificationsBell } from "@/components/NotificationsBell";
import { useThemeMode } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { AIBadge, BrandMark } from "@/components/ui/Brand";
import { useAiStatus } from "@/lib/hooks/useAiStatus";
import type { MenuProps } from "antd";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

export interface ShellUser {
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "COMMERCIAL" | "LECTEUR";
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "#94a3b8", MANAGER: "#fbbf24", COMMERCIAL: "#a78bfa", LECTEUR: "#94a0bd",
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Administrateur", MANAGER: "Manager", COMMERCIAL: "Commercial", LECTEUR: "Lecteur",
};

/** Titre affiché dans l'en-tête selon la section. */
const SECTION_TITLES: Record<string, string> = {
  "/dashboard": "Tableau de bord",
  "/leads": "Leads",
  "/import": "Import",
  "/scraping": "Prospection IA",
  "/campaigns": "Campagnes",
  "/inbox": "Réponses",
  "/sequences": "Relances",
  "/pipeline": "Pipeline",
  "/analytics": "Analytics",
  "/settings": "Configuration",
};

function group(label: string, collapsed: boolean) {
  return collapsed ? [] : [{ type: "group" as const, label, children: [] }];
}

function buildNav(role: ShellUser["role"], collapsed: boolean): MenuProps["items"] {
  const isManager = role === "ADMIN" || role === "MANAGER";
  return [
    { key: "/dashboard", icon: <HomeOutlined />, label: <Link href="/dashboard">Tableau de bord</Link> },
    ...group("Prospection", collapsed),
    {
      key: "/scraping",
      icon: <RadarChartOutlined />,
      label: (
        <Link href="/scraping" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          Prospection IA <span style={{ fontSize: 10, color: "#a78bfa" }}>✦</span>
        </Link>
      ),
    },
    { key: "/leads", icon: <TeamOutlined />, label: <Link href="/leads">Leads</Link> },
    { key: "/import", icon: <ImportOutlined />, label: <Link href="/import">Import</Link> },
    ...group("Engagement", collapsed),
    { key: "/campaigns", icon: <MailOutlined />, label: <Link href="/campaigns">Campagnes</Link> },
    { key: "/sequences", icon: <RetweetOutlined />, label: <Link href="/sequences">Relances</Link> },
    { key: "/inbox", icon: <MessageOutlined />, label: <Link href="/inbox">Réponses</Link> },
    ...group("Pilotage", collapsed),
    { key: "/pipeline", icon: <ProjectOutlined />, label: <Link href="/pipeline">Pipeline</Link> },
    { key: "/analytics", icon: <BarChartOutlined />, label: <Link href="/analytics">Analytics</Link> },
    ...(isManager
      ? [...group("Administration", collapsed), { key: "/settings", icon: <SettingOutlined />, label: <Link href="/settings">Configuration</Link> }]
      : []),
  ];
}

function UserAvatar({ user, initials, size = 34 }: { user: ShellUser; initials: string; size?: number }) {
  return (
    <div style={{ padding: 2, borderRadius: "50%", background: `conic-gradient(${ROLE_COLORS[user.role]}, #8b5cf6, ${ROLE_COLORS[user.role]})`, flexShrink: 0 }}>
      <Avatar size={size} style={{ background: "var(--nb-bg)", color: "var(--nb-text-strong)", fontSize: 12, fontWeight: 700 }}>{initials}</Avatar>
    </div>
  );
}

function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div style={{ height: 72, display: "flex", alignItems: "center", gap: 12, padding: collapsed ? 0 : "0 22px", justifyContent: collapsed ? "center" : "flex-start" }}>
      <BrandMark size={36} />
      {!collapsed && (
        <div style={{ lineHeight: 1.1 }}>
          <div className="nb-display" style={{ fontWeight: 700, fontSize: 17, color: "var(--nb-text-strong)" }}>CRM Lead</div>
          <div style={{ fontSize: 10, letterSpacing: "0.22em", color: "var(--nb-text-3)", textTransform: "uppercase" }}>AI Prospecting</div>
        </div>
      )}
    </div>
  );
}

function SidebarFooter({ user, initials }: { user: ShellUser; initials: string }) {
  return (
    <div style={{ padding: 14 }}>
      <div className="nb-glass" style={{ borderRadius: 16, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <UserAvatar user={user} initials={initials} size={30} />
          <div style={{ minWidth: 0 }}>
            <Text style={{ color: "var(--nb-text-strong)", fontSize: 13, fontWeight: 600, display: "block" }} ellipsis>{user.name}</Text>
            <span style={{ fontSize: 11, color: ROLE_COLORS[user.role] }}>{ROLE_LABELS[user.role]}</span>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <AiStatusBadge />
        </div>
      </div>
    </div>
  );
}

/** État de l'IA ; le fournisseur choisi par l'administrateur n'apparaît qu'au survol et dans la Configuration. */
function AiStatusBadge() {
  const ai = useAiStatus();
  return (
    <Tooltip title={ai ? `Fournisseur : ${ai.label} — modifiable dans Configuration › Intelligence artificielle` : undefined}>
      <span><AIBadge active={ai?.enabled ?? true}>{ai && !ai.enabled ? "IA désactivée" : "IA active"}</AIBadge></span>
    </Tooltip>
  );
}

export default function DashboardShell({ user, children }: { user: ShellUser; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const { mode } = useThemeMode();

  const selectedKey = Object.keys(SECTION_TITLES).find((k) => pathname.startsWith(k)) ?? "/dashboard";

  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => { if (!isMobile) setDrawerOpen(false); }, [isMobile]);

  async function logout() {
    try { await api.post("/auth/logout"); } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  const initials = user.name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
  const menu = (
    <Menu
      theme={mode}
      mode="inline"
      selectedKeys={[selectedKey]}
      items={buildNav(user.role, isMobile ? false : collapsed)}
      style={{ border: "none", background: "transparent" }}
      className="nb-nav"
      onClick={() => { if (isMobile) setDrawerOpen(false); }}
    />
  );

  return (
    <Layout style={{ minHeight: "100vh", background: "transparent" }}>
      {!isMobile && (
        <Sider
          collapsible
          collapsed={collapsed}
          trigger={null}
          width={252}
          collapsedWidth={84}
          style={{ position: "sticky", top: 0, height: "100vh", padding: 0 }}
        >
          <div
            className="nb-glass"
            style={{ position: "absolute", inset: "12px 0 12px 12px", borderRadius: 22, display: "flex", flexDirection: "column", overflow: "hidden" }}
          >
            <SidebarBrand collapsed={collapsed} />
            <div style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>{menu}</div>
            {!collapsed && <SidebarFooter user={user} initials={initials} />}
          </div>
        </Sider>
      )}

      {isMobile && (
        <Drawer
          placement="left"
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          width={280}
          styles={{ body: { padding: 0, display: "flex", flexDirection: "column" } }}
          title={null}
          closeIcon={null}
        >
          <SidebarBrand collapsed={false} />
          <div style={{ flex: 1 }}>{menu}</div>
          <SidebarFooter user={user} initials={initials} />
        </Drawer>
      )}

      <Layout style={{ background: "transparent" }}>
        <Header
          style={{
            position: "sticky", top: 0, zIndex: 100, height: "auto", lineHeight: "normal",
            padding: isMobile ? "10px 12px 0" : "12px 24px 0", background: "transparent",
          }}
        >
          <div
            className="nb-glass"
            style={{ borderRadius: 18, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
              <button
                type="button"
                aria-label="Menu"
                onClick={() => (isMobile ? setDrawerOpen(true) : setCollapsed(!collapsed))}
                style={{
                  width: 38, height: 38, borderRadius: 12, border: "1px solid var(--nb-border)", background: "var(--nb-control)",
                  color: "var(--nb-text-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                {isMobile ? <MenuOutlined /> : collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              </button>
              <div style={{ minWidth: 0 }}>
                <div className="nb-eyebrow" style={{ fontSize: 10 }}>CRM Lead</div>
                <div className="nb-display" style={{ fontWeight: 600, fontSize: 16, color: "var(--nb-text-strong)", whiteSpace: "nowrap" }}>
                  {SECTION_TITLES[selectedKey]}
                </div>
              </div>
            </div>

            {!isMobile && (
              <Input
                prefix={<SearchOutlined style={{ color: "var(--nb-text-3)" }} />}
                placeholder="Rechercher un lead, une entreprise…"
                allowClear
                style={{ maxWidth: 380, borderRadius: 12, background: "var(--nb-control)" }}
                onPressEnter={(e) => {
                  const q = (e.target as HTMLInputElement).value.trim();
                  if (q) router.push(`/leads?q=${encodeURIComponent(q)}`);
                }}
              />
            )}

            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {!isMobile && (
                <AiStatusBadge />
              )}
              <ThemeToggle />
              <NotificationsBell borderColor="var(--nb-border)" textColor="var(--nb-text-2)" />
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
                    { type: "divider" },
                    { key: "logout", icon: <LogoutOutlined />, label: "Déconnexion", danger: true, onClick: logout },
                  ],
                }}
                trigger={["click"]}
                placement="bottomRight"
              >
                <div style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                  <UserAvatar user={user} initials={initials} />
                  {!isMobile && (
                    <div style={{ lineHeight: 1.25 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--nb-text-strong)" }}>{user.name.split(" ")[0]}</div>
                      <div style={{ fontSize: 11, color: "var(--nb-text-3)" }}>{ROLE_LABELS[user.role]}</div>
                    </div>
                  )}
                </div>
              </Dropdown>
            </div>
          </div>
        </Header>

        <Content style={{ padding: isMobile ? "16px 12px 24px" : "24px 24px 40px", maxWidth: "100%", overflowX: "clip" }}>
          <div key={pathname} className="nb-fade-up">{children}</div>
        </Content>
      </Layout>
    </Layout>
  );
}
