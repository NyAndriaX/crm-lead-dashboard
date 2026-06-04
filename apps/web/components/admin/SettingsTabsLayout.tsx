"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Card, Grid, Menu, Select, Space, Typography, theme } from "antd";
import type { MenuProps } from "antd";
import { ADMIN_ACCENT, PAGE_CARD_STYLE } from "@/lib/pageUi";

const { Title, Paragraph } = Typography;

export type SettingsTabItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  group?: string;
  description?: string;
  children: ReactNode;
};

type Props = {
  items: SettingsTabItem[];
  defaultActiveKey?: string;
};

const GROUP_ORDER = [
  "Général",
  "Équipe & accès",
  "Commercial",
  "Plateforme",
  "Conformité",
];

function groupItems(items: SettingsTabItem[]): { title: string; items: SettingsTabItem[] }[] {
  const map = new Map<string, SettingsTabItem[]>();
  for (const item of items) {
    const g = item.group ?? "Général";
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(item);
  }
  const ordered = GROUP_ORDER.filter((g) => map.has(g));
  for (const g of map.keys()) {
    if (!ordered.includes(g)) ordered.push(g);
  }
  return ordered.map((title) => ({ title, items: map.get(title)! }));
}

function groupLabel(title: string) {
  return (
    <span
      style={{
        fontSize: 10,
        letterSpacing: 1,
        textTransform: "uppercase",
        opacity: 0.55,
        fontWeight: 600,
      }}
    >
      {title}
    </span>
  );
}

export function SettingsTabsLayout({ items, defaultActiveKey }: Props) {
  const [activeKey, setActiveKey] = useState(defaultActiveKey ?? items[0]?.key ?? "");
  const screens = Grid.useBreakpoint();
  const { token } = theme.useToken();
  const isSideNav = !screens.xs && (screens.md ?? true);

  const active = items.find((t) => t.key === activeKey) ?? items[0];
  const groups = useMemo(() => groupItems(items), [items]);

  const menuItems: MenuProps["items"] = useMemo(
    () =>
      groups.map((g) => ({
        type: "group" as const,
        label: groupLabel(g.title),
        children: g.items.map((item) => ({
          key: item.key,
          icon: item.icon,
          label: item.label,
        })),
      })),
    [groups],
  );

  const contentCard = (
    <Card
      style={{ ...PAGE_CARD_STYLE, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}
      styles={{
        header: { borderBottom: `1px solid ${token.colorBorderSecondary}` },
        body: {
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          padding: screens.xs ? 16 : 20,
        },
      }}
      title={
        <Space size={10}>
          {active?.icon ? (
            <span style={{ color: ADMIN_ACCENT, fontSize: 18, display: "flex" }}>{active.icon}</span>
          ) : null}
          <Title level={5} style={{ margin: 0 }}>
            {active?.label}
          </Title>
        </Space>
      }
    >
      {active?.description ? (
        <Paragraph type="secondary" style={{ marginTop: 0, marginBottom: 16 }}>
          {active.description}
        </Paragraph>
      ) : null}
      <div key={activeKey}>{active?.children}</div>
    </Card>
  );

  if (!isSideNav) {
    return (
      <div className="settings-layout settings-layout--stacked">
        <Select
          value={activeKey}
          onChange={setActiveKey}
          options={items.map((i) => ({ value: i.key, label: i.label }))}
          size="large"
          style={{ width: "100%" }}
          aria-label="Section administration"
        />
        {contentCard}
      </div>
    );
  }

  return (
    <div className="settings-layout">
      <Card
        className="settings-nav-card"
        style={{ ...PAGE_CARD_STYLE, minHeight: 0, height: "100%" }}
        styles={{
          body: {
            padding: 8,
            minHeight: 0,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            background: token.colorBgContainer,
          },
        }}
      >
        <div className="settings-nav-scroll">
          <Menu
            mode="inline"
            selectedKeys={[activeKey]}
            items={menuItems}
            onClick={({ key }) => setActiveKey(key)}
            className="settings-nav-menu"
            style={{ border: "none", background: token.colorBgContainer }}
          />
        </div>
      </Card>
      {contentCard}
    </div>
  );
}
