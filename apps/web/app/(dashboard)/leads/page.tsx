"use client";

import { useCallback, useEffect, useState } from "react";
import { Table, Tag, Typography, Button, Space, Input, message } from "antd";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import type { SorterResult } from "antd/es/table/interface";
import { api } from "@/lib/client";

const { Title } = Typography;

interface LeadDTO {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  source: string | null;
  status: string;
  score: number;
  lastActionAt: string | null;
}
interface ListResponse {
  data: LeadDTO[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const STATUS_COLORS: Record<string, string> = {
  NOUVEAU: "default", CONTACTE: "blue", QUALIFIE: "cyan",
  EN_DISCUSSION: "gold", CONVERTI: "green", PERDU: "red",
};

export default function LeadsPage() {
  const [rows, setRows] = useState<LeadDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<string | undefined>();
  const [q, setQ] = useState("");

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ListResponse>("/leads", {
        params: { page, pageSize, sort, q: q || undefined },
      });
      setRows(data.data);
      setTotal(data.pagination.total);
    } catch {
      message.error("Impossible de charger les leads.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, sort, q]);

  useEffect(() => {
    void fetchLeads();
  }, [fetchLeads]);

  const columns: ColumnsType<LeadDTO> = [
    {
      title: "Nom",
      key: "name",
      render: (_, r) => [r.firstName, r.lastName].filter(Boolean).join(" ") || "—",
    },
    { title: "Entreprise", dataIndex: "company", key: "company", sorter: true, render: (v) => v || "—" },
    { title: "Email", dataIndex: "email", key: "email", render: (v) => v || "—" },
    { title: "Source", dataIndex: "source", key: "source", render: (v) => v || "—" },
    {
      title: "Statut", dataIndex: "status", key: "status",
      render: (s: string) => <Tag color={STATUS_COLORS[s] ?? "default"}>{s}</Tag>,
    },
    { title: "Score", dataIndex: "score", key: "score", sorter: true, width: 90 },
    {
      title: "Dernière action", dataIndex: "lastActionAt", key: "lastActionAt", sorter: true,
      render: (v: string | null) => (v ? new Date(v).toLocaleString("fr-FR") : "—"),
    },
  ];

  function onTableChange(
    pag: TablePaginationConfig,
    _filters: unknown,
    sorter: SorterResult<LeadDTO> | SorterResult<LeadDTO>[],
  ) {
    setPage(pag.current ?? 1);
    setPageSize(pag.pageSize ?? 50);
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    if (s && s.field && s.order) setSort(`${String(s.field)}:${s.order === "ascend" ? "asc" : "desc"}`);
    else setSort(undefined);
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Title level={3} style={{ margin: 0 }}>Leads</Title>
        <Space>
          <Input.Search
            placeholder="Rechercher (nom, entreprise, notes)…"
            allowClear
            style={{ width: 320 }}
            onSearch={(v) => { setPage(1); setQ(v.trim()); }}
          />
          <Button type="primary" disabled>Nouveau lead</Button>
        </Space>
      </div>
      <Table<LeadDTO>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        loading={loading}
        onChange={onTableChange}
        pagination={{
          current: page, pageSize, total,
          showSizeChanger: true, pageSizeOptions: [50, 100, 200],
          showTotal: (t) => `${t} lead${t > 1 ? "s" : ""}`,
        }}
      />
    </Space>
  );
}
