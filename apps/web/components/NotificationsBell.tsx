"use client";

/**
 * Cloche de notifications dans le header (R-05).
 *
 * - Poll /api/notifications/unread-count toutes les 60s.
 * - Click → dropdown affiche les 10 dernières notifs avec lien.
 * - Click sur une notif : mark-as-read puis suit le lien.
 */
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge, Button, Dropdown, Empty, List, Space, Tag, Tooltip, Typography,
} from "antd";
import {
  BellOutlined, CheckOutlined, CloseCircleOutlined, MailOutlined, ProjectOutlined, RadarChartOutlined, TeamOutlined, UserSwitchOutlined, RobotOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";
import { alpha, palette } from "@/lib/theme";

const { Text } = Typography;

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

const ICON_BY_TYPE: Record<string, React.ReactNode> = {
  reply_received: <MailOutlined style={{ color: palette.cyan }} />,
  lead_assigned: <UserSwitchOutlined style={{ color: palette.violet }} />,
  sequence_started: <ProjectOutlined style={{ color: palette.violet }} />,
  team_invite: <TeamOutlined style={{ color: palette.amber }} />,
  scraping_done: <RadarChartOutlined style={{ color: palette.green }} />,
  scraping_error: <CloseCircleOutlined style={{ color: palette.red }} />,
  auto_reply_draft: <RobotOutlined style={{ color: palette.amber }} />,
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  return new Date(iso).toLocaleDateString("fr-FR");
}

export function NotificationsBell({ borderColor, textColor }: { borderColor: string; textColor: string }) {
  const router = useRouter();
  const [unread, setUnread] = useState(0);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const fetchCount = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: { count: number } }>("/notifications/unread-count");
      setUnread(data.data.count);
    } catch {
      /* silencieux : un user non auth ne doit pas spam les logs */
    }
  }, []);

  const fetchList = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await api.get<{ data: Notif[]; unread: number }>(
        "/notifications?pageSize=10",
      );
      setNotifs(data.data);
      setUnread(data.unread);
    } catch {
      /* silencieux */
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void fetchCount();
    const id = setInterval(fetchCount, 60_000);
    return () => clearInterval(id);
  }, [fetchCount]);

  useEffect(() => {
    if (open) void fetchList();
  }, [open, fetchList]);

  async function handleClick(n: Notif) {
    if (!n.isRead) {
      try { await api.post(`/notifications/${n.id}/read`); } catch { /* silencieux */ }
    }
    if (n.link) router.push(n.link);
    setOpen(false);
    void fetchCount();
  }

  async function markAll() {
    try {
      await api.post("/notifications/mark-all-read");
      setUnread(0);
      setNotifs((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch { /* silencieux */ }
  }

  const content = (
    <div
      style={{
        width: 380, maxHeight: 480, overflow: "auto",
        // Couleurs du thème (clair / sombre) : surface, bordure et ombre des panneaux flottants.
        background: "var(--nb-drawer)", borderRadius: 16, border: "1px solid var(--nb-border)",
        boxShadow: "var(--nb-popover-shadow)", backdropFilter: "blur(18px)",
      }}
    >
      <div
        style={{
          padding: "12px 16px", borderBottom: "1px solid var(--nb-border)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}
      >
        <Text strong>Notifications</Text>
        {unread > 0 && (
          <Button size="small" type="link" icon={<CheckOutlined />} onClick={() => void markAll()}>
            Tout marquer lu
          </Button>
        )}
      </div>
      {notifs.length === 0 ? (
        <div style={{ padding: 32 }}>
          <Empty description={busy ? "Chargement…" : "Aucune notification"} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      ) : (
        <List
          itemLayout="horizontal"
          dataSource={notifs}
          renderItem={(n) => (
            <List.Item
              onClick={() => void handleClick(n)}
              style={{
                padding: "10px 16px",
                cursor: n.link ? "pointer" : "default",
                background: n.isRead ? "transparent" : alpha(palette.violet, "1f"),
                borderBottom: "1px solid var(--nb-border)",
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                if (n.link) (e.currentTarget as HTMLElement).style.background = n.isRead ? "var(--nb-control)" : alpha(palette.violet, "33");
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = n.isRead ? "transparent" : alpha(palette.violet, "1f");
              }}
            >
              <Space align="start" size={10} style={{ width: "100%" }}>
                <div
                  style={{
                    fontSize: 20, marginTop: 2, width: 28, height: 28,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    borderRadius: 10,
                    background: alpha(
                      n.type === "scraping_done" ? palette.green
                        : n.type === "scraping_error" ? palette.red
                        : n.type === "auto_reply_draft" ? palette.amber
                        : n.type === "reply_received" ? palette.cyan
                        : palette.violet,
                      "24",
                    ),
                  }}
                >
                  {ICON_BY_TYPE[n.type] ?? <BellOutlined style={{ color: "var(--nb-text-2)" }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                    <Text strong style={{ fontSize: 13, lineHeight: "18px" }}>{n.title}</Text>
                    <Text type="secondary" style={{ fontSize: 11, whiteSpace: "nowrap", marginTop: 1 }}>
                      {timeAgo(n.createdAt)}
                    </Text>
                  </div>
                  {n.body && (
                    <Text type="secondary" style={{ fontSize: 12, display: "block", marginTop: 3, lineHeight: "17px" }}>
                      {n.body}
                    </Text>
                  )}
                  <div style={{ display: "flex", gap: 6, marginTop: 5, alignItems: "center" }}>
                    {!n.isRead && (
                      <Tag color="blue" style={{ fontSize: 10, lineHeight: "16px", margin: 0 }}>
                        Non lu
                      </Tag>
                    )}
                    {n.link && (
                      <Text style={{ fontSize: 11, color: palette.violet }}>
                        Cliquer pour ouvrir →
                      </Text>
                    )}
                  </div>
                </div>
              </Space>
            </List.Item>
          )}
        />
      )}
    </div>
  );

  return (
    <Dropdown
      open={open}
      onOpenChange={setOpen}
      placement="bottomRight"
      trigger={["click"]}
      popupRender={() => content}
    >
      <Tooltip title="Notifications">
        <Badge count={unread} overflowCount={99} offset={[-4, 4]}>
          <div
            style={{
              width: 38, height: 38, borderRadius: 12, border: `1px solid ${borderColor}`, background: "rgba(148,163,184,0.06)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", color: textColor,
            }}
          >
            <BellOutlined />
          </div>
        </Badge>
      </Tooltip>
    </Dropdown>
  );
}
