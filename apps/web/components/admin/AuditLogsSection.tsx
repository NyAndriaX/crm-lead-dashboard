"use client";

/**
 * Section Journal d'activité (U-05) — visualisation filtrable des audit logs.
 *
 * Filtres : utilisateur, action, période (from/to), recherche libre.
 * Affichage paginé (50/page par défaut) avec détail diff au clic.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Card, Table, Tag, Typography, Space, Button, DatePicker, Select, Input, Drawer,
  message, Empty,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { ReloadOutlined, FilterOutlined, SearchOutlined, EyeOutlined } from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { api } from "@/lib/client";

const { Text, Title } = Typography;
const { RangePicker } = DatePicker;

type AuditUser = { id: string; name: string; email: string } | null;

type AuditLogItem = {
  id: string;
  userId: string | null;
  user: AuditUser;
  action: string;
  entityType: string | null;
  entityId: string | null;
  ip: string | null;
  diff: unknown;
  createdAt: string;
};

type UserOption = { id: string; name: string; email: string };

const ACTION_COLORS: Record<string, string> = {
  "auth.login.success": "green",
  "auth.login.failed": "red",
  "auth.login.totp_failed": "red",
  "auth.logout": "default",
  "auth.2fa.enabled": "blue",
  "auth.2fa.disabled": "orange",
  "user.create": "green",
  "user.update": "blue",
  "user.deactivate": "orange",
  "user.invite": "purple",
  "user.force_logout": "volcano",
  "user.reset_2fa": "volcano",
  "team.create": "cyan",
  "team.delete": "red",
};

function colorFor(action: string): string {
  if (ACTION_COLORS[action]) return ACTION_COLORS[action];
  if (action.endsWith(".failed") || action.startsWith("user.deactivate") || action.includes("delete")) return "red";
  if (action.startsWith("auth.")) return "green";
  if (action.startsWith("lead.")) return "blue";
  if (action.startsWith("team.")) return "cyan";
  if (action.startsWith("user.")) return "purple";
  return "default";
}

export function AuditLogsSection() {
  const [rows, setRows] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [loading, setLoading] = useState(false);
  const [actions, setActions] = useState<string[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [filterUserId, setFilterUserId] = useState<string | undefined>();
  const [filterAction, setFilterAction] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [detailRow, setDetailRow] = useState<AuditLogItem | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (filterUserId) params.set("userId", filterUserId);
      if (filterAction) params.set("action", filterAction);
      if (search.trim()) params.set("search", search.trim());
      if (range?.[0]) params.set("from", range[0].toISOString());
      if (range?.[1]) params.set("to", range[1].toISOString());
      const { data } = await api.get<{ data: AuditLogItem[]; total: number }>(
        `/audit-logs?${params.toString()}`,
      );
      setRows(data.data);
      setTotal(data.total);
    } catch {
      message.error("Impossible de charger le journal d'activité.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filterUserId, filterAction, search, range]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  useEffect(() => {
    (async () => {
      try {
        const [a, u] = await Promise.all([
          api.get<{ data: string[] }>("/audit-logs/actions"),
          api.get<{ data: UserOption[] }>("/users?all=true"),
        ]);
        setActions(a.data.data);
        setUsers(u.data.data);
      } catch {
        /* non bloquant */
      }
    })();
  }, []);

  function resetFilters() {
    setFilterUserId(undefined);
    setFilterAction(undefined);
    setSearch("");
    setRange(null);
    setPage(1);
  }

  const columns: ColumnsType<AuditLogItem> = [
    {
      title: "Date",
      dataIndex: "createdAt",
      key: "createdAt",
      width: 160,
      render: (v) =>
        new Date(v).toLocaleString("fr-FR", {
          day: "numeric", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit", second: "2-digit",
        }),
    },
    {
      title: "Utilisateur",
      key: "user",
      width: 220,
      render: (_, r) =>
        r.user ? (
          <Space direction="vertical" size={0}>
            <Text strong>{r.user.name}</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>{r.user.email}</Text>
          </Space>
        ) : (
          <Text type="secondary" italic>Anonyme / système</Text>
        ),
    },
    {
      title: "Action",
      dataIndex: "action",
      key: "action",
      width: 240,
      render: (v: string) => <Tag color={colorFor(v)} style={{ fontWeight: 500 }}>{v}</Tag>,
    },
    {
      title: "Cible",
      key: "entity",
      width: 180,
      responsive: ["lg"],
      render: (_, r) =>
        r.entityType ? (
          <Space direction="vertical" size={0}>
            <Text strong style={{ fontSize: 12 }}>{r.entityType}</Text>
            <Text type="secondary" code style={{ fontSize: 11 }}>
              {r.entityId ? r.entityId.slice(0, 12) + "…" : "—"}
            </Text>
          </Space>
        ) : (
          <Text type="secondary">—</Text>
        ),
    },
    {
      title: "IP",
      dataIndex: "ip",
      key: "ip",
      width: 140,
      responsive: ["xl"],
      render: (v) => v ? <Text code style={{ fontSize: 12 }}>{v}</Text> : <Text type="secondary">—</Text>,
    },
    {
      title: "",
      key: "actions",
      width: 50,
      render: (_, r) => (
        <Button size="small" type="text" icon={<EyeOutlined />} onClick={() => setDetailRow(r)} />
      ),
    },
  ];

  return (
    <Space direction="vertical" size={16} style={{ width: "100%" }}>
      <Card size="small">
        <Space size={12} wrap style={{ width: "100%" }}>
          <Space>
            <FilterOutlined />
            <Text strong>Filtres</Text>
          </Space>
          <Select
            placeholder="Utilisateur"
            allowClear
            value={filterUserId}
            onChange={(v) => { setFilterUserId(v); setPage(1); }}
            style={{ width: 220 }}
            showSearch
            options={users.map((u) => ({ value: u.id, label: `${u.name} — ${u.email}` }))}
            filterOption={(input, opt) =>
              String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())
            }
          />
          <Select
            placeholder="Action"
            allowClear
            value={filterAction}
            onChange={(v) => { setFilterAction(v); setPage(1); }}
            style={{ width: 220 }}
            showSearch
            options={actions.map((a) => ({ value: a, label: a }))}
          />
          <RangePicker
            showTime
            value={range as [Dayjs, Dayjs] | null}
            onChange={(v) => { setRange(v); setPage(1); }}
            placeholder={["Du", "Au"]}
          />
          <Input.Search
            placeholder="Recherche (IP, ID, action…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={() => { setPage(1); void fetchAll(); }}
            allowClear
            style={{ width: 240 }}
            prefix={<SearchOutlined />}
          />
          <Button onClick={resetFilters}>Réinitialiser</Button>
          <Button icon={<ReloadOutlined />} onClick={() => fetchAll()}>Actualiser</Button>
        </Space>
      </Card>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        size="middle"
        scroll={{ x: 900 }}
        locale={{ emptyText: <Empty description="Aucun événement" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          pageSizeOptions: [25, 50, 100, 200],
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          showTotal: (t) => `${t} entrée(s)`,
        }}
      />

      <Drawer
        title={
          <Space>
            <Tag color={detailRow ? colorFor(detailRow.action) : "default"}>{detailRow?.action}</Tag>
            <Text type="secondary">
              {detailRow ? new Date(detailRow.createdAt).toLocaleString("fr-FR") : ""}
            </Text>
          </Space>
        }
        open={!!detailRow}
        onClose={() => setDetailRow(null)}
        width={520}
      >
        {detailRow && (
          <Space direction="vertical" size={12} style={{ width: "100%" }}>
            <div>
              <Title level={5} style={{ marginTop: 0 }}>Acteur</Title>
              {detailRow.user ? (
                <Space direction="vertical" size={0}>
                  <Text strong>{detailRow.user.name}</Text>
                  <Text type="secondary">{detailRow.user.email}</Text>
                </Space>
              ) : (
                <Text type="secondary" italic>Anonyme</Text>
              )}
            </div>
            <div>
              <Title level={5}>Contexte</Title>
              <Text>IP : </Text>
              <Text code>{detailRow.ip ?? "—"}</Text>
              <br />
              <Text>Cible : </Text>
              <Text code>{detailRow.entityType ?? "—"} {detailRow.entityId ?? ""}</Text>
            </div>
            <div>
              <Title level={5}>Détails</Title>
              {detailRow.diff ? (
                <pre
                  style={{
                    background: "rgba(2,6,16,0.7)", padding: 12, borderRadius: 10, border: "1px solid var(--nb-border)",
                    fontSize: 12, overflow: "auto", maxHeight: 400,
                  }}
                >
                  {JSON.stringify(detailRow.diff, null, 2)}
                </pre>
              ) : (
                <Text type="secondary">Aucun détail enregistré.</Text>
              )}
            </div>
          </Space>
        )}
      </Drawer>
    </Space>
  );
}
