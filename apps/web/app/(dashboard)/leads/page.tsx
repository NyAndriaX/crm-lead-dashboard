"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table, Tag, Typography, Button, Space, Input, InputNumber, Select, Dropdown, message,
  Modal, Form, Row, Col,
} from "antd";
import { DownloadOutlined, SaveOutlined, ReloadOutlined, PlusOutlined } from "@ant-design/icons";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import type { SorterResult } from "antd/es/table/interface";
import { api } from "@/lib/client";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/leadStatus";

const { Title } = Typography;

interface LeadDTO {
  id: string; email: string | null; firstName: string | null; lastName: string | null;
  company: string | null; source: string | null; status: keyof typeof STATUS_LABELS;
  score: number; lastActionAt: string | null;
}
interface ListResponse { data: LeadDTO[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
interface LeadView { id: string; name: string; filters: Record<string, unknown>; columns: string[]; shared: boolean }
interface UserLite { id: string; name: string; email: string }

type Filters = { q?: string; status?: string; source?: string; scoreMin?: number };

interface CreateLeadForm {
  email?: string; phone?: string; firstName?: string; lastName?: string;
  company?: string; website?: string; sector?: string; city?: string;
  country?: string; source?: string; status?: string; notes?: string;
  assignedToId?: string;
}

export default function LeadsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<LeadDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [sort, setSort] = useState<string | undefined>();
  const [filters, setFilters] = useState<Filters>({});
  const [views, setViews] = useState<LeadView[]>([]);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [form] = Form.useForm<CreateLeadForm>();
  const [users, setUsers] = useState<UserLite[]>([]);

  const queryParams = useMemo(
    () => ({ page, pageSize, sort, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== "")) }),
    [page, pageSize, sort, filters],
  );

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ListResponse>("/leads", { params: queryParams });
      setRows(data.data); setTotal(data.pagination.total);
    } catch { message.error("Impossible de charger les leads."); }
    finally { setLoading(false); }
  }, [queryParams]);

  useEffect(() => { void fetchLeads(); }, [fetchLeads]);
  useEffect(() => { api.get<{ data: LeadView[] }>("/lead-views").then((r) => setViews(r.data.data)).catch(() => {}); }, []);
  useEffect(() => { api.get<{ data: UserLite[] }>("/users").then((r) => setUsers(r.data.data)).catch(() => {}); }, []);

  const columns: ColumnsType<LeadDTO> = [
    { title: "Nom", key: "name", render: (_, r) => [r.firstName, r.lastName].filter(Boolean).join(" ") || "—" },
    { title: "Entreprise", dataIndex: "company", key: "company", sorter: true, render: (v) => v || "—" },
    { title: "Email", dataIndex: "email", key: "email", render: (v) => v || "—" },
    { title: "Source", dataIndex: "source", key: "source", render: (v) => v || "—" },
    { title: "Statut", dataIndex: "status", key: "status", render: (s: keyof typeof STATUS_LABELS) => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s]}</Tag> },
    { title: "Score", dataIndex: "score", key: "score", sorter: true, width: 90 },
    { title: "Dernière action", dataIndex: "lastActionAt", key: "lastActionAt", sorter: true, render: (v: string | null) => (v ? new Date(v).toLocaleString("fr-FR") : "—") },
  ];

  function onTableChange(pag: TablePaginationConfig, _f: unknown, sorter: SorterResult<LeadDTO> | SorterResult<LeadDTO>[]) {
    setPage(pag.current ?? 1); setPageSize(pag.pageSize ?? 50);
    const s = Array.isArray(sorter) ? sorter[0] : sorter;
    setSort(s && s.field && s.order ? `${String(s.field)}:${s.order === "ascend" ? "asc" : "desc"}` : undefined);
  }

  function setFilter<K extends keyof Filters>(k: K, v: Filters[K]) { setPage(1); setFilters((f) => ({ ...f, [k]: v })); }

  function exportUrl(format: "csv" | "xlsx") {
    const p = new URLSearchParams({ format });
    for (const [k, v] of Object.entries(filters)) if (v !== undefined && v !== "") p.set(k, String(v));
    return `/api/leads/export?${p.toString()}`;
  }

  async function saveCurrentView() {
    const name = window.prompt("Nom de la vue ?");
    if (!name) return;
    try {
      await api.post("/lead-views", { name, filters, columns: columns.map((c) => String(c.key)), sort });
      const r = await api.get<{ data: LeadView[] }>("/lead-views"); setViews(r.data.data);
      message.success("Vue enregistrée");
    } catch { message.error("Échec de l'enregistrement de la vue."); }
  }
  function applyView(viewId: string) {
    const v = views.find((x) => x.id === viewId);
    if (!v) return;
    const { sort: s, ...f } = v.filters as Filters & { sort?: string };
    setPage(1); setFilters(f); setSort(s);
  }

  async function handleCreateLead() {
    try {
      const values = await form.validateFields();
      setCreateLoading(true);
      await api.post("/leads", {
        ...values,
        email: values.email || null,
        phone: values.phone || null,
        assignedToId: values.assignedToId || null,
        website: values.website || null,
      });
      message.success("Lead créé avec succès");
      form.resetFields();
      setCreateOpen(false);
      void fetchLeads();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      if (msg) message.error(msg);
    } finally {
      setCreateLoading(false);
    }
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <Title level={3} style={{ margin: 0 }}>Leads</Title>
        <Space wrap>
          <Select
            allowClear placeholder="Vue sauvegardée" style={{ width: 180 }}
            options={views.map((v) => ({ value: v.id, label: v.name }))} onChange={(v) => v && applyView(v)}
          />
          <Button icon={<SaveOutlined />} onClick={saveCurrentView}>Sauvegarder la vue</Button>
          <Dropdown menu={{ items: [
            { key: "csv", label: <a href={exportUrl("csv")}>CSV</a> },
            { key: "xlsx", label: <a href={exportUrl("xlsx")}>Excel (.xlsx)</a> },
          ] }}>
            <Button icon={<DownloadOutlined />}>Exporter</Button>
          </Dropdown>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Nouveau lead
          </Button>
        </Space>
      </div>

      <Space wrap>
        <Input.Search placeholder="Rechercher (nom, entreprise, notes)…" allowClear style={{ width: 300 }} onSearch={(v) => setFilter("q", v.trim() || undefined)} />
        <Select
          allowClear placeholder="Statut" style={{ width: 160 }}
          options={Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          onChange={(v) => setFilter("status", v)}
        />
        <Input placeholder="Source" allowClear style={{ width: 140 }} onChange={(e) => setFilter("source", e.target.value || undefined)} />
        <InputNumber placeholder="Score min" min={0} max={100} style={{ width: 110 }} onChange={(v) => setFilter("scoreMin", v ?? undefined)} />
        <Button icon={<ReloadOutlined />} onClick={() => fetchLeads()}>Rafraîchir</Button>
      </Space>

      <Table<LeadDTO>
        rowKey="id" columns={columns} dataSource={rows} loading={loading} onChange={onTableChange}
        onRow={(r) => ({ onClick: () => router.push(`/leads/${r.id}`), style: { cursor: "pointer" } })}
        pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [50, 100, 200], showTotal: (t) => `${t} lead${t > 1 ? "s" : ""}` }}
      />

      {/* ── Modale de création de lead ─────────────────────────────────────── */}
      <Modal
        title="Nouveau lead"
        open={createOpen}
        onOk={handleCreateLead}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        confirmLoading={createLoading}
        okText="Créer"
        cancelText="Annuler"
        width={700}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="firstName" label="Prénom">
                <Input placeholder="Jean" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="lastName" label="Nom">
                <Input placeholder="Dupont" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="email"
                label="Email"
                rules={[{ type: "email", message: "Email invalide" }]}
              >
                <Input placeholder="jean.dupont@entreprise.com" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="Téléphone">
                <Input placeholder="+33 6 00 00 00 00" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="company" label="Entreprise">
                <Input placeholder="Acme SA" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="website"
                label="Site web"
                rules={[{ type: "url", message: "URL invalide" }]}
              >
                <Input placeholder="https://acme.com" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="sector" label="Secteur">
                <Input placeholder="Tech, Finance…" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="city" label="Ville">
                <Input placeholder="Paris" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="country" label="Pays">
                <Input placeholder="France" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="source" label="Source">
                <Input placeholder="LinkedIn, salon, formulaire…" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="status" label="Statut" initialValue="NOUVEAU">
                <Select options={Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="assignedToId" label="Assigné à">
            <Select
              allowClear
              placeholder="Choisir un commercial…"
              options={users.map((u) => ({ value: u.id, label: `${u.name} (${u.email})` }))}
              showSearch
              filterOption={(input, opt) => String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
            />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} placeholder="Contexte, remarques…" maxLength={10000} showCount />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
