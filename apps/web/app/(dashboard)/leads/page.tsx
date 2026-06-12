"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Table, Tag, Typography, Button, Space, Input, InputNumber, Select, Dropdown, Modal, Form, Row, Col, Popconfirm, Tooltip } from "antd";
import {
  DownloadOutlined, SaveOutlined, ReloadOutlined, PlusOutlined,
  DeleteOutlined, UserSwitchOutlined, TagsOutlined, ThunderboltOutlined,
  RetweetOutlined, MoreOutlined, EditOutlined, EnvironmentOutlined, TeamOutlined, MailOutlined,
} from "@ant-design/icons";
import type { ColumnsType, TablePaginationConfig } from "antd/es/table";
import type { SorterResult } from "antd/es/table/interface";
import { api } from "@/lib/client";
import { fetchTags } from "@/lib/tagsClient";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/leadStatus";
import { useBreakpoint, useIsMobile } from "@/lib/responsive";
import { BulkEnrichModal } from "@/components/leads/BulkEnrichModal";
import {
  applyApiFieldErrors,
  isFormValidationError,
  notifyApiError,
  notifyError,
  notifyInfo,
  notifySuccess,
  notifyWarning,
} from "@/lib/feedback";

const { Title, Text } = Typography;

interface LeadDTO {
  id: string; email: string | null; firstName: string | null; lastName: string | null;
  company: string | null; source: string | null; status: keyof typeof STATUS_LABELS;
  score: number; tags: string[]; lastActionAt: string | null;
}
interface ListResponse { data: LeadDTO[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }
interface LeadView { id: string; name: string; filters: Record<string, unknown>; columns: string[]; shared: boolean }
interface UserLite { id: string; name: string; email: string }
interface TagDTO { id: string; name: string; color: string | null }
interface SequenceLite { id: string; name: string }

type Filters = { q?: string; status?: string; source?: string; scoreMin?: number; tag?: string };

interface CreateLeadForm {
  email?: string; phone?: string; firstName?: string; lastName?: string;
  company?: string; website?: string; sector?: string; city?: string;
  country?: string; source?: string; status?: string; notes?: string;
  assignedToId?: string; tags?: string[];
}

type BulkAction = "delete" | "assign" | "status" | "tags-add" | "tags-remove" | "enroll-sequence" | "create-segment" | "exclude-campaign";

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
  const [tagsRef, setTagsRef] = useState<TagDTO[]>([]);
  const [campaignsRef, setCampaignsRef] = useState<{ id: string; name: string; status: string }[]>([]);
  const [sequences, setSequences] = useState<SequenceLite[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState<BulkAction | null>(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [enrichOpen, setEnrichOpen] = useState(false);
  const [bulkForm] = Form.useForm();

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [form] = Form.useForm<CreateLeadForm>();
  const [users, setUsers] = useState<UserLite[]>([]);
  const isMobile = useIsMobile();
  const screens = useBreakpoint();

  const queryParams = useMemo(
    () => ({ page, pageSize, sort, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined && v !== "")) }),
    [page, pageSize, sort, filters],
  );

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<ListResponse>("/leads", { params: queryParams });
      setRows(data.data); setTotal(data.pagination.total);
    } catch (e) { notifyApiError(e, "Impossible de charger les leads."); }
    finally { setLoading(false); }
  }, [queryParams]);

  const reloadTags = useCallback(async () => {
    try {
      setTagsRef(await fetchTags());
    } catch { /* non bloquant */ }
  }, []);

  useEffect(() => { void fetchLeads(); }, [fetchLeads]);
  useEffect(() => { api.get<{ data: LeadView[] }>("/lead-views").then((r) => setViews(r.data.data)).catch(() => {}); }, []);
  useEffect(() => { api.get<{ data: UserLite[] }>("/users").then((r) => setUsers(r.data.data)).catch(() => {}); }, []);
  useEffect(() => { void reloadTags(); }, [reloadTags]);
  useEffect(() => {
    api.get<{ data: { id: string; name: string; status: string }[] }>("/campaigns")
      .then((r) => setCampaignsRef((r.data.data ?? []).filter((c) => ["SCHEDULED", "SENDING", "PAUSED"].includes(c.status))))
      .catch(() => {});
  }, []);
  useEffect(() => {
    api.get<{ data: SequenceLite[] }>("/sequences").then((r) => setSequences(r.data.data ?? [])).catch(() => {});
  }, []);

  // ── Bulk actions ──────────────────────────────────────────────────────────

  async function runBulk(action: BulkAction, payload: Record<string, unknown> = {}) {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      const { data } = await api.post<{ data: { requested: number; succeeded: number; failed: number } }>(
        "/leads/bulk",
        { action, ids: selectedIds, ...payload },
      );
      const r = data.data;
      notifySuccess(
        `${r.succeeded}/${r.requested} lead${r.requested > 1 ? "s" : ""} traité${r.requested > 1 ? "s" : ""}${r.failed ? ` (${r.failed} échec${r.failed > 1 ? "s" : ""})` : ""}`,
      );
      setBulkOpen(null);
      bulkForm.resetFields();
      setSelectedIds([]);
      void fetchLeads();
      if (action === "tags-add" || action === "tags-remove") void reloadTags();
    } catch (e) { notifyApiError(e, "Erreur"); } finally {
      setBulkLoading(false);
    }
  }

  function openBulk(action: BulkAction) {
    bulkForm.resetFields();
    setBulkOpen(action);
  }

  async function submitBulkForm() {
    if (!bulkOpen) return;
    const values = await bulkForm.validateFields();
    if (bulkOpen === "create-segment") {
      setBulkLoading(true);
      try {
        await api.post("/segments", {
          name: values.segmentName,
          filters: { mode: "manual", leadIds: selectedIds },
        });
        notifySuccess(`Segment « ${values.segmentName} » créé avec ${selectedIds.length} lead(s)`);
        setBulkOpen(null);
        bulkForm.resetFields();
        setSelectedIds([]);
      } catch (e) { notifyApiError(e, "Création impossible"); } finally {
        setBulkLoading(false);
      }
      return;
    }
    await runBulk(bulkOpen, values);
  }

  // ── Colonnes ──────────────────────────────────────────────────────────────

  const columns: ColumnsType<LeadDTO> = [
    { title: "Prénom", dataIndex: "firstName", key: "firstName", sorter: true, render: (v: string | null) => v || <Text type="secondary">—</Text> },
    { title: "Nom", dataIndex: "lastName", key: "lastName", sorter: true, render: (v: string | null) => v || <Text type="secondary">—</Text> },
    { title: "Entreprise", dataIndex: "company", key: "company", sorter: true, render: (v) => v || "—" },
    { title: "Email", dataIndex: "email", key: "email", responsive: ["md"], render: (v) => v || "—" },
    { title: "Source", dataIndex: "source", key: "source", responsive: ["lg"], render: (v) => v || "—" },
    {
      title: "Tags", dataIndex: "tags", key: "tags", responsive: ["md"], width: 220,
      render: (tags: string[] | null) => {
        const list = tags ?? [];
        if (list.length === 0) return <Text type="secondary">—</Text>;
        const display = list.slice(0, 3);
        const more = list.length - display.length;
        return (
          <Space size={4} wrap>
            {display.map((t) => {
              const ref = tagsRef.find((x) => x.name === t);
              return (
                <Tag key={t} color={ref?.color ?? "default"} style={{ margin: 0 }}>{t}</Tag>
              );
            })}
            {more > 0 && (
              <Tooltip title={list.slice(3).join(", ")}>
                <Tag style={{ margin: 0 }}>+{more}</Tag>
              </Tooltip>
            )}
          </Space>
        );
      },
    },
    { title: "Statut", dataIndex: "status", key: "status", render: (s: keyof typeof STATUS_LABELS) => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s]}</Tag> },
    { title: "Score", dataIndex: "score", key: "score", sorter: true, width: 90 },
    { title: "Dernière action", dataIndex: "lastActionAt", key: "lastActionAt", sorter: true, responsive: ["sm"], render: (v: string | null) => (v ? new Date(v).toLocaleString("fr-FR") : "—") },
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

  function crmExportUrl(target: "hubspot" | "pipedrive" | "salesforce") {
    const p = new URLSearchParams({ format: "csv", target });
    for (const [k, v] of Object.entries(filters)) if (v !== undefined && v !== "") p.set(k, String(v));
    return `/api/integrations/crm-export?${p.toString()}`;
  }

  async function saveCurrentView() {
    const name = window.prompt("Nom de la vue ?");
    if (!name) return;
    try {
      await api.post("/lead-views", { name, filters, columns: columns.map((c) => String(c.key)), sort });
      const r = await api.get<{ data: LeadView[] }>("/lead-views"); setViews(r.data.data);
      notifySuccess("Vue enregistrée");
    } catch (e) { notifyApiError(e, "Échec de l'enregistrement de la vue."); }
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
        tags: values.tags ?? [],
      });
      notifySuccess("Lead créé avec succès");
      form.resetFields();
      setCreateOpen(false);
      void fetchLeads();
      void reloadTags();
    } catch (e) {
      if (isFormValidationError(e)) throw e;
      applyApiFieldErrors(e, form);
      notifyApiError(e, "Impossible de créer le lead.");
      throw e;
    } finally {
      setCreateLoading(false);
    }
  }

  // ── Bulk actions toolbar ─────────────────────────────────────────────────

  const hasSelection = selectedIds.length > 0;

  function bulkLabel() {
    switch (bulkOpen) {
      case "delete": return "Supprimer les leads sélectionnés";
      case "assign": return "Assigner les leads sélectionnés";
      case "status": return "Changer le statut";
      case "tags-add": return "Ajouter des tags";
      case "tags-remove": return "Retirer des tags";
      case "enroll-sequence": return "Inscrire dans une séquence";
      case "create-segment": return "Créer un segment";
      case "exclude-campaign": return "Retirer de la campagne en cours";
      default: return "";
    }
  }

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <div className="page-toolbar">
        <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>Leads</Title>
        <div className="page-toolbar-actions">
          <Select
            allowClear placeholder="Vue sauvegardée" style={{ minWidth: isMobile ? undefined : 180, width: isMobile ? "100%" : 180 }}
            options={views.map((v) => ({ value: v.id, label: v.name }))} onChange={(v) => v && applyView(v)}
          />
          <Button icon={<SaveOutlined />} onClick={saveCurrentView}>Sauvegarder la vue</Button>
          <Link href="/leads/map"><Button icon={<EnvironmentOutlined />}>Carte</Button></Link>
          <Dropdown menu={{ items: [
            { key: "csv", label: <a href={exportUrl("csv")}>CSV</a> },
            { key: "xlsx", label: <a href={exportUrl("xlsx")}>Excel (.xlsx)</a> },
            { type: "divider" },
            { key: "g-crm", label: "Export vers un CRM tiers", disabled: true },
            { key: "hubspot", label: <a href={crmExportUrl("hubspot")}>HubSpot (CSV)</a> },
            { key: "pipedrive", label: <a href={crmExportUrl("pipedrive")}>Pipedrive (CSV)</a> },
            { key: "salesforce", label: <a href={crmExportUrl("salesforce")}>Salesforce (CSV)</a> },
          ] }}>
            <Button icon={<DownloadOutlined />}>Exporter</Button>
          </Dropdown>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            Nouveau lead
          </Button>
        </div>
      </div>

      <div className="page-filters">
        <Input.Search placeholder="Rechercher (nom, entreprise, notes)…" allowClear onSearch={(v) => setFilter("q", v.trim() || undefined)} />
        <Select
          allowClear placeholder="Statut"
          options={Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
          onChange={(v) => setFilter("status", v)}
        />
        <Select
          allowClear placeholder="Tag"
          options={tagsRef.map((t) => ({ value: t.name, label: <Tag color={t.color ?? "default"} style={{ margin: 0 }}>{t.name}</Tag> }))}
          onChange={(v) => setFilter("tag", v)}
          style={{ minWidth: 160 }}
          showSearch
          filterOption={(input, opt) => String(opt?.value ?? "").toLowerCase().includes(input.toLowerCase())}
        />
        <Input placeholder="Source" allowClear onChange={(e) => setFilter("source", e.target.value || undefined)} />
        <InputNumber placeholder="Score min" min={0} max={100} onChange={(v) => setFilter("scoreMin", v ?? undefined)} />
        <Button icon={<ReloadOutlined />} onClick={() => { void fetchLeads(); void reloadTags(); }}>Rafraîchir</Button>
      </div>

      {/* Toolbar bulk actions (apparaît quand sélection non vide) */}
      {hasSelection && (
        <div
          style={{
            background: "#e6f4ff",
            border: "1px solid #91caff",
            borderRadius: 8,
            padding: "10px 16px",
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Text strong style={{ color: "#1677ff" }}>
            {selectedIds.length} lead{selectedIds.length > 1 ? "s" : ""} sélectionné{selectedIds.length > 1 ? "s" : ""}
          </Text>
          <Space wrap>
            <Tooltip title="Assigner à un commercial">
              <Button icon={<UserSwitchOutlined />} onClick={() => openBulk("assign")}>Assigner</Button>
            </Tooltip>
            <Tooltip title="Changer le statut">
              <Button icon={<EditOutlined />} onClick={() => openBulk("status")}>Changer statut</Button>
            </Tooltip>
            <Tooltip title="Ajouter des tags">
              <Button icon={<TagsOutlined />} onClick={() => openBulk("tags-add")}>Ajouter tags</Button>
            </Tooltip>
            <Tooltip title="Lancer l'approche sur les leads sélectionnés (email, firmographie, LinkedIn, actu…)">
              <Button icon={<ThunderboltOutlined />} onClick={() => setEnrichOpen(true)}>Approche</Button>
            </Tooltip>
            <Tooltip title="Créer un segment emailing à partir de la sélection">
              <Button icon={<TeamOutlined />} onClick={() => openBulk("create-segment")}>Créer segment</Button>
            </Tooltip>
            <Dropdown
              menu={{
                items: [
                  { key: "tags-remove", label: <Space><TagsOutlined /> Retirer des tags</Space>, onClick: () => openBulk("tags-remove") },
                  { key: "enroll-sequence", label: <Space><RetweetOutlined /> Inscrire dans une séquence</Space>, onClick: () => openBulk("enroll-sequence") },
                  { key: "exclude-campaign", label: <Space><MailOutlined /> Retirer de campagne email</Space>, onClick: () => openBulk("exclude-campaign") },
                ],
              }}
            >
              <Button icon={<MoreOutlined />}>Plus</Button>
            </Dropdown>
            <Popconfirm
              title={`Supprimer ${selectedIds.length} lead${selectedIds.length > 1 ? "s" : ""} ?`}
              description="Suppression douce — les leads pourront être restaurés."
              okText="Supprimer"
              okButtonProps={{ danger: true }}
              cancelText="Annuler"
              onConfirm={() => void runBulk("delete")}
            >
              <Button danger icon={<DeleteOutlined />}>Supprimer</Button>
            </Popconfirm>
            <Button size="small" type="link" onClick={() => setSelectedIds([])}>
              Annuler la sélection
            </Button>
          </Space>
        </div>
      )}

      <div className="page-table-wrap">
        <Table<LeadDTO>
          rowKey="id" columns={columns} dataSource={rows} loading={loading} onChange={onTableChange}
          scroll={{ x: 1100 }}
          rowSelection={{
            selectedRowKeys: selectedIds,
            onChange: (keys) => setSelectedIds(keys.map((k) => String(k))),
            preserveSelectedRowKeys: true,
          }}
          onRow={(r) => ({
            onClick: (e) => {
              // Ne pas naviguer si on clique sur la case à cocher
              const target = e.target as HTMLElement;
              if (target.closest(".ant-checkbox-wrapper") || target.closest(".ant-table-selection-column")) return;
              router.push(`/leads/${r.id}`);
            },
            style: { cursor: "pointer" },
          })}
          pagination={{ current: page, pageSize, total, showSizeChanger: true, pageSizeOptions: [50, 100, 200], showTotal: (t) => `${t} lead${t > 1 ? "s" : ""}` }}
        />
      </div>

      {/* ── Bulk actions modals ──────────────────────────────────────────── */}
      <Modal
        open={!!bulkOpen}
        title={<Space><ThunderboltOutlined /> {bulkLabel()} <Tag color="blue">{selectedIds.length}</Tag></Space>}
        onCancel={() => { setBulkOpen(null); bulkForm.resetFields(); }}
        onOk={() => void submitBulkForm()}
        confirmLoading={bulkLoading}
        okText="Appliquer"
        cancelText="Annuler"
        destroyOnClose
      >
        <Form form={bulkForm} layout="vertical" style={{ marginTop: 16 }}>
          {bulkOpen === "assign" && (
            <Form.Item
              name="assignedToId"
              label="Commercial"
              rules={[{ required: true, message: "Sélectionnez un commercial (ou null pour désassigner)" }]}
            >
              <Select
                allowClear
                placeholder="Choisir (vide = désassigner)"
                options={[{ value: null, label: "(Désassigner)" }, ...users.map((u) => ({ value: u.id, label: `${u.name} — ${u.email}` }))]}
                showSearch
                filterOption={(input, opt) => String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>
          )}
          {bulkOpen === "status" && (
            <Form.Item
              name="status"
              label="Nouveau statut"
              rules={[{ required: true, message: "Sélectionnez un statut" }]}
            >
              <Select
                options={Object.entries(STATUS_LABELS).map(([v, l]) => ({
                  value: v,
                  label: <Tag color={STATUS_COLORS[v as keyof typeof STATUS_COLORS]}>{l}</Tag>,
                }))}
              />
            </Form.Item>
          )}
          {(bulkOpen === "tags-add" || bulkOpen === "tags-remove") && (
            <Form.Item
              name="tags"
              label={bulkOpen === "tags-add" ? "Tags à ajouter" : "Tags à retirer"}
              rules={[{ required: true, message: "Au moins un tag" }]}
            >
              <Select
                mode="tags"
                placeholder="Saisir ou choisir des tags…"
                tokenSeparators={[","]}
                options={tagsRef.map((t) => ({
                  value: t.name,
                  label: <Tag color={t.color ?? "default"} style={{ margin: 0 }}>{t.name}</Tag>,
                }))}
              />
            </Form.Item>
          )}
          {bulkOpen === "exclude-campaign" && (
            <Form.Item name="campaignId" label="Campagne active" rules={[{ required: true }]}>
              <Select
                placeholder="Choisir une campagne en cours…"
                options={campaignsRef.map((c) => ({ value: c.id, label: `${c.name} (${c.status})` }))}
              />
            </Form.Item>
          )}
          {bulkOpen === "enroll-sequence" && (
            <Form.Item
              name="sequenceId"
              label="Séquence"
              rules={[{ required: true, message: "Sélectionnez une séquence" }]}
            >
              <Select
                placeholder="Choisir une séquence…"
                options={sequences.map((s) => ({ value: s.id, label: s.name }))}
                showSearch
                filterOption={(input, opt) => String(opt?.label ?? "").toLowerCase().includes(input.toLowerCase())}
              />
            </Form.Item>
          )}
          {bulkOpen === "create-segment" && (
            <Form.Item
              name="segmentName"
              label="Nom du segment"
              rules={[{ required: true, message: "Nom requis" }]}
              extra={`${selectedIds.length} lead(s) seront inclus dans ce segment (sélection manuelle).`}
            >
              <Input placeholder="Ex : Prospects qualifiés — sélection mars" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      {/* ── Modale de création de lead ─────────────────────────────────────── */}
      <Modal
        title="Nouveau lead"
        open={createOpen}
        onOk={handleCreateLead}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        confirmLoading={createLoading}
        okText="Créer"
        cancelText="Annuler"
        width={screens.md ? 700 : "100%"}
        style={{ top: screens.md ? 100 : 16, maxWidth: "calc(100vw - 32px)" }}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="firstName" label="Prénom">
                <Input placeholder="Jean" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="lastName" label="Nom">
                <Input placeholder="Dupont" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item
                name="email"
                label="Email"
                rules={[{ type: "email", message: "Email invalide" }]}
              >
                <Input placeholder="jean.dupont@entreprise.com" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="phone" label="Téléphone">
                <Input placeholder="+33 6 00 00 00 00" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="company" label="Entreprise">
                <Input placeholder="Acme SA" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
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
            <Col xs={24} sm={8}>
              <Form.Item name="sector" label="Secteur">
                <Input placeholder="Tech, Finance…" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="city" label="Ville">
                <Input placeholder="Paris" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="country" label="Pays">
                <Input placeholder="France" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="source" label="Source">
                <Input placeholder="LinkedIn, salon, formulaire…" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
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
          <Form.Item name="tags" label="Tags">
            <Select
              mode="tags"
              placeholder="Ajouter des tags…"
              tokenSeparators={[","]}
              options={tagsRef.map((t) => ({ value: t.name, label: t.name }))}
            />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={3} placeholder="Contexte, remarques…" maxLength={10000} showCount />
          </Form.Item>
        </Form>
      </Modal>

      <BulkEnrichModal
        open={enrichOpen}
        leadIds={selectedIds}
        onClose={() => setEnrichOpen(false)}
        onDone={() => { void fetchLeads(); }}
      />
    </Space>
  );
}
