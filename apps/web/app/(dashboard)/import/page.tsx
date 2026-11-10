"use client";

/**
 * Page Import CSV/XLSX — CRM-021 → CRM-027, I-03 / I-07 / I-09.
 * Wizard en 4 étapes :
 *  1. Upload du fichier
 *  2. Mapping colonnes ↔ champs lead + options (colonnes obligatoires, source et tags par défaut,
 *     assignation à un commercial ou répartition à tour de rôle)
 *  3. Aperçu + confirmation
 *  4. Traitement en cours + résultat (rapport détaillé des lignes rejetées ou nettoyées)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Steps, Upload, Button, Typography, Table, Select, Space, Card, Alert, Progress,
  Row, Col, Tag, Badge, Divider, Tooltip, message, Collapse, Statistic, List,
  Switch, Input, Radio,
} from "antd";
import {
  InboxOutlined, ArrowLeftOutlined, ArrowRightOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ReloadOutlined, DeleteOutlined, HistoryOutlined,
  ThunderboltOutlined,
  CloudUploadOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { IMPORTABLE_FIELD_LABELS, defaultRequiredFields, type ImportableField } from "@/lib/schemas/import";
import { useIsMobile } from "@/lib/responsive";
import { ImportTemplateGallery } from "@/components/import/ImportTemplateGallery";

const { Title, Text, Paragraph } = Typography;
const { Dragger } = Upload;

const LEAD_FIELDS = Object.entries(IMPORTABLE_FIELD_LABELS).map(([value, label]) => ({ value, label }));

interface UploadResult {
  id: string;
  fileName: string;
  headers: string[];
  previewRows: Record<string, string>[];
  totalRows: number;
}

interface ImportIssue { row: number; action: "rejected" | "cleaned"; field: ImportableField | null; reason: string }

interface ImportJob {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  errorRows: number;
  cleanedRows?: number;
  errorReport: string | null;
  report?: {
    requiredFields?: ImportableField[];
    assignment?: { mode: AssignMode; counts?: Record<string, number> };
    issues?: ImportIssue[];
    truncated?: boolean;
  } | null;
  createdAt: string;
  user?: { id: string; name: string };
}

interface UserLite { id: string; name: string; role: string; isActive: boolean }
interface TagRef { id: string; name: string }

type Mapping = Partial<Record<ImportableField, string>>;
type AssignMode = "none" | "single" | "roundRobin";

export default function ImportPage() {
  const [step, setStep] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [defaultSource, setDefaultSource] = useState("");
  const [defaultTags, setDefaultTags] = useState<string[]>([]);
  // I-03 — colonnes obligatoires : règle par défaut (email, sinon entreprise) tant que l'utilisateur n'y touche pas.
  const [requiredFields, setRequiredFields] = useState<ImportableField[]>([]);
  const [requiredTouched, setRequiredTouched] = useState(false);
  // I-09 — assignation des leads importés.
  const [assignMode, setAssignMode] = useState<AssignMode>("none");
  const [assignees, setAssignees] = useState<string[]>([]);
  const [users, setUsers] = useState<UserLite[] | null>(null);
  const [tagsRef, setTagsRef] = useState<TagRef[]>([]);
  const [starting, setStarting] = useState(false);
  const [currentJob, setCurrentJob] = useState<ImportJob | null>(null);
  const [history, setHistory] = useState<ImportJob[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMobile = useIsMobile();

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get<{ data: ImportJob[] }>("/import");
      setHistory(data.data);
    } catch { /* silencieux */ }
    finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => { void fetchHistory(); }, [fetchHistory]);

  useEffect(() => {
    // Liste des commerciaux : réservée à la permission leads:assign (403 sinon → pas d'assignation proposée).
    api.get<{ data: UserLite[] }>("/users")
      .then((r) => setUsers(r.data.data.filter((u) => u.isActive && u.role !== "LECTEUR")))
      .catch(() => setUsers([]));
    api.get<{ data: TagRef[] }>("/tags").then((r) => setTagsRef(r.data.data)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (requiredTouched) return;
    setRequiredFields(defaultRequiredFields(Object.keys(mapping).filter((k) => mapping[k as ImportableField])) as ImportableField[]);
  }, [mapping, requiredTouched]);

  // Polling du statut quand l'import tourne
  useEffect(() => {
    if (!currentJob || !["running", "pending"].includes(currentJob.status)) {
      if (pollRef.current) clearTimeout(pollRef.current);
      return;
    }
    const poll = async () => {
      try {
        const { data } = await api.get<{ data: ImportJob }>(`/import/${currentJob.id}`);
        setCurrentJob(data.data);
        if (["running", "pending"].includes(data.data.status)) {
          pollRef.current = setTimeout(() => { void poll(); }, 2000);
        } else {
          void fetchHistory();
        }
      } catch { /* silencieux */ }
    };
    pollRef.current = setTimeout(() => { void poll(); }, 2000);
    return () => { if (pollRef.current) clearTimeout(pollRef.current); };
  }, [currentJob, fetchHistory]);

  async function handleUpload(file: File): Promise<boolean> {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post<{ data: UploadResult }>("/import", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadResult(data.data);
      // Auto-mapping : si un en-tête ressemble à un champ lead
      const autoMap: Mapping = {};
      for (const field of Object.keys(IMPORTABLE_FIELD_LABELS) as ImportableField[]) {
        const label = IMPORTABLE_FIELD_LABELS[field].toLowerCase();
        const match = data.data.headers.find((h) =>
          h.toLowerCase() === label ||
          h.toLowerCase() === field.toLowerCase() ||
          h.toLowerCase().replace(/[^a-z]/g, "") === field.toLowerCase()
        );
        if (match) autoMap[field] = match;
      }
      setMapping(autoMap);
      setStep(1);
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur lors de l'upload";
      message.error(msg);
    } finally {
      setUploading(false);
    }
    return false;
  }

  async function handleStart() {
    if (!uploadResult) return;
    if (Object.keys(mapping).length === 0) {
      message.warning("Mappez au moins une colonne avant de continuer.");
      return;
    }
    if (assignMode === "single" && assignees.length !== 1) {
      message.warning("Choisissez le commercial à qui assigner les leads.");
      return;
    }
    if (assignMode === "roundRobin" && assignees.length < 2) {
      message.warning("Choisissez au moins deux commerciaux pour la répartition à tour de rôle.");
      return;
    }
    setStarting(true);
    try {
      const assignment =
        assignMode === "single" ? { mode: "single", userId: assignees[0] }
          : assignMode === "roundRobin" ? { mode: "roundRobin", userIds: assignees }
          : { mode: "none" };
      const { data } = await api.post<{ data: ImportJob }>(`/import/${uploadResult.id}/start`, {
        mapping,
        skipDuplicates,
        defaultSource: defaultSource || undefined,
        defaultTags: defaultTags.length ? defaultTags : undefined,
        requiredFields: requiredFields.filter((f) => mapping[f]),
        assignment,
      });
      setCurrentJob(data.data);
      setStep(3);
      void fetchHistory();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Impossible de démarrer l'import";
      message.error(msg);
    } finally {
      setStarting(false);
    }
  }

  function reset() {
    setStep(0);
    setUploadResult(null);
    setMapping({});
    setCurrentJob(null);
    setDefaultSource("");
    setDefaultTags([]);
    setRequiredFields([]);
    setRequiredTouched(false);
    setAssignMode("none");
    setAssignees([]);
    setSkipDuplicates(true);
  }

  const userName = (id: string) => users?.find((u) => u.id === id)?.name ?? "Commercial";

  // ── Step 1 : Upload ───────────────────────────────────────────────────────
  function renderUpload() {
    return (
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <ImportTemplateGallery />
        <Card>
          <Dragger
            accept=".csv,.xlsx,.xls"
            multiple={false}
            showUploadList={false}
            beforeUpload={(file) => { void handleUpload(file); return false; }}
            disabled={uploading}
            style={{ padding: "40px 20px" }}
          >
            <p className="ant-upload-drag-icon"><InboxOutlined style={{ fontSize: 48, color: "#8b5cf6" }} /></p>
            <p className="ant-upload-text" style={{ fontSize: 18 }}>Glissez votre fichier ici</p>
            <p className="ant-upload-hint">Formats acceptés : CSV, XLSX, XLS · Taille max : 50 Mo</p>
          </Dragger>
          {uploading && <Progress percent={99} status="active" style={{ marginTop: 16 }} />}
        </Card>
      </Space>
    );
  }

  // ── Step 2 : Mapping ──────────────────────────────────────────────────────
  async function autoDetectMapping() {
    if (!uploadResult) return;
    try {
      const { data } = await api.post<{ data: Record<string, string> }>(
        "/import/suggest-mapping",
        { headers: uploadResult.headers },
      );
      // data: { headerFromFile: fieldCRM } → on veut { fieldCRM: headerFromFile }
      const reversed: Partial<Record<ImportableField, string>> = {};
      for (const [header, field] of Object.entries(data.data)) {
        reversed[field as ImportableField] = header;
      }
      const detected = Object.keys(reversed).length;
      if (detected === 0) {
        message.info("Aucune colonne automatiquement reconnue. Mappage manuel.");
        return;
      }
      setMapping((m) => ({ ...m, ...reversed }));
      message.success(`${detected} colonne${detected > 1 ? "s" : ""} détectée${detected > 1 ? "s" : ""} automatiquement`);
    } catch {
      message.error("Auto-détection indisponible.");
    }
  }

  function renderMapping() {
    if (!uploadResult) return null;
    const cols = uploadResult.headers;

    return (
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Alert
          message={`Fichier : ${uploadResult.fileName} — ${uploadResult.totalRows} ligne(s) détectée(s)`}
          type="info" showIcon
        />

        <Card
          title="Correspondance colonnes ↔ champs CRM"
          extra={
            <Button
              icon={<ThunderboltOutlined />}
              size="small"
              type="primary"
              ghost
              onClick={() => void autoDetectMapping()}
            >
              Auto-détecter
            </Button>
          }
        >
          <Row gutter={[16, 12]}>
            {LEAD_FIELDS.map(({ value, label }) => (
              <Col key={value} xs={24} sm={12} md={8}>
                <div style={{ marginBottom: 4 }}>
                  <Text strong>{label}</Text>
                </div>
                <Select
                  allowClear
                  style={{ width: "100%" }}
                  placeholder="— ignorer —"
                  value={mapping[value as ImportableField]}
                  options={cols.map((c) => ({ value: c, label: c }))}
                  onChange={(v) => setMapping((m) => ({ ...m, [value]: v ?? undefined }))}
                />
              </Col>
            ))}
          </Row>
        </Card>

        <Card title="Contrôle des lignes">
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <div>
              <div style={{ marginBottom: 4 }}><Text strong>Colonnes obligatoires</Text></div>
              <Select<ImportableField[]>
                mode="multiple"
                data-testid="import-required-fields"
                style={{ width: "100%" }}
                placeholder="Aucune colonne obligatoire"
                value={requiredFields.filter((f) => mapping[f])}
                onChange={(v) => { setRequiredFields(v); setRequiredTouched(true); }}
                options={LEAD_FIELDS.filter(({ value }) => mapping[value as ImportableField])}
              />
              <Text type="secondary" style={{ fontSize: 12 }}>
                Une ligne dont l&apos;une de ces colonnes est vide ou invalide est rejetée et listée dans le rapport.
                Par défaut : l&apos;email, ou l&apos;entreprise si le fichier n&apos;a pas de colonne email.
              </Text>
            </div>
            <Alert
              type="info"
              showIcon
              message="Formats vérifiés automatiquement"
              description="Email (format standard), téléphone (normalisé au format international +33…) et site web (adresse http(s) complète). Une valeur invalide rejette la ligne si la colonne est obligatoire ; sinon elle est retirée et la ligne est importée « nettoyée »."
            />
          </Space>
        </Card>

        <Card title="Options d'import">
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Space>
              <Switch checked={skipDuplicates} onChange={setSkipDuplicates} />
              <Text>Ignorer les doublons (même email)</Text>
            </Space>
            <Row gutter={[16, 12]}>
              <Col xs={24} md={12}>
                <div style={{ marginBottom: 4 }}><Text strong>Source par défaut</Text></div>
                <Input
                  value={defaultSource}
                  onChange={(e) => setDefaultSource(e.target.value)}
                  placeholder="CSV import, salon…"
                />
              </Col>
              <Col xs={24} md={12}>
                <div style={{ marginBottom: 4 }}><Text strong>Tags par défaut</Text></div>
                <Select<string[]>
                  mode="tags"
                  data-testid="import-default-tags"
                  style={{ width: "100%" }}
                  placeholder="Salon 2026, Webinar…"
                  value={defaultTags}
                  onChange={(v) => setDefaultTags(v.map((t) => t.trim()).filter(Boolean).slice(0, 20))}
                  tokenSeparators={[","]}
                  options={tagsRef.map((t) => ({ value: t.name, label: t.name }))}
                />
              </Col>
            </Row>
            {users && users.length > 0 && (
              <div>
                <div style={{ marginBottom: 4 }}><Text strong>Assignation des leads importés</Text></div>
                <Radio.Group
                  value={assignMode}
                  onChange={(e) => { setAssignMode(e.target.value as AssignMode); setAssignees([]); }}
                  optionType="button"
                  options={[
                    { value: "none", label: "Aucune" },
                    { value: "single", label: "Un commercial" },
                    { value: "roundRobin", label: "Tour de rôle" },
                  ]}
                />
                {assignMode !== "none" && (
                  <Select<string | string[]>
                    mode={assignMode === "roundRobin" ? "multiple" : undefined}
                    data-testid="import-assignees"
                    style={{ width: "100%", marginTop: 8 }}
                    placeholder={assignMode === "roundRobin" ? "Choisir au moins deux commerciaux" : "Choisir le commercial"}
                    value={assignMode === "roundRobin" ? assignees : assignees[0]}
                    onChange={(v) => setAssignees(Array.isArray(v) ? v : v ? [v] : [])}
                    showSearch
                    optionFilterProp="label"
                    options={users.map((u) => ({ value: u.id, label: u.name }))}
                  />
                )}
                {assignMode === "roundRobin" && (
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    Les leads créés sont répartis un par un, dans l&apos;ordre de la liste (1er lead au 1er commercial, 2e au 2e…).
                  </Text>
                )}
              </div>
            )}
          </Space>
        </Card>

        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => setStep(0)} block={isMobile}>Retour</Button>
          <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => setStep(2)} block={isMobile}>
            Aperçu ({Object.values(mapping).filter(Boolean).length} colonne(s) mappée(s))
          </Button>
        </div>
      </Space>
    );
  }

  // ── Step 3 : Aperçu ───────────────────────────────────────────────────────
  function renderPreview() {
    if (!uploadResult) return null;
    const mappedFields = Object.entries(mapping).filter(([, v]) => v) as [ImportableField, string][];

    const previewCols: ColumnsType<Record<string, string>> = mappedFields.map(([field, col]) => ({
      title: (
        <Space size={4}>
          <Tag color="blue">{IMPORTABLE_FIELD_LABELS[field]}</Tag>
          <Text type="secondary" style={{ fontSize: 11 }}>← {col}</Text>
        </Space>
      ),
      dataIndex: col,
      key: field,
      ellipsis: true,
      render: (v: string) => v || <Text type="secondary">—</Text>,
    }));

    return (
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Alert
          message={`Aperçu des 10 premières lignes · ${uploadResult.totalRows} ligne(s) au total`}
          type="info" showIcon
        />

        <Card>
          <Table
            size="small"
            rowKey={(r, i) => String(i)}
            columns={previewCols}
            dataSource={uploadResult.previewRows}
            pagination={false}
            scroll={{ x: "max-content" }}
          />
        </Card>

        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => setStep(1)} block={isMobile}>Modifier le mapping</Button>
          <Button type="primary" loading={starting} onClick={handleStart} block={isMobile}>
            Lancer l&apos;import ({uploadResult.totalRows} ligne(s))
          </Button>
        </div>
      </Space>
    );
  }

  // ── Step 4 : Traitement ───────────────────────────────────────────────────
  function renderProcessing() {
    if (!currentJob) return null;
    const isDone = currentJob.status === "done";
    const isFailed = currentJob.status === "failed";
    const isRunning = ["running", "pending"].includes(currentJob.status);
    const pct = currentJob.totalRows > 0
      ? Math.round(((currentJob.importedRows + currentJob.duplicateRows + currentJob.errorRows) / currentJob.totalRows) * 100)
      : isRunning ? 50 : 100;

    return (
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Card>
          {isRunning && (
            <>
              <Progress percent={pct} status="active" strokeColor="#8b5cf6" />
              <Text type="secondary">Traitement en cours… ({currentJob.importedRows} / {currentJob.totalRows} lignes)</Text>
            </>
          )}
          {isDone && (
            <>
              <Progress percent={100} status="success" />
              <Alert
                icon={<CheckCircleOutlined />}
                type="success"
                message="Import terminé"
                description={
                  <Row gutter={24} style={{ marginTop: 8 }}>
                    <Col><Statistic title="Importés" value={currentJob.importedRows} valueStyle={{ color: "#34d399" }} /></Col>
                    <Col><Statistic title="Doublons ignorés" value={currentJob.duplicateRows} valueStyle={{ color: "#faad14" }} /></Col>
                    <Col><Statistic title="Nettoyées" value={currentJob.cleanedRows ?? 0} valueStyle={{ color: (currentJob.cleanedRows ?? 0) > 0 ? "#8b5cf6" : undefined }} /></Col>
                    <Col><Statistic title="Rejetées" value={currentJob.errorRows} valueStyle={{ color: currentJob.errorRows > 0 ? "#ff4d4f" : undefined }} /></Col>
                    <Col><Statistic title="Total" value={currentJob.totalRows} /></Col>
                  </Row>
                }
                showIcon={false}
                style={{ marginTop: 16 }}
              />
            </>
          )}
          {isFailed && (
            <>
              <Progress percent={pct} status="exception" />
              <Alert type="error" message="Import échoué" description={currentJob.errorReport} showIcon icon={<CloseCircleOutlined />} style={{ marginTop: 16 }} />
            </>
          )}

          {isDone && renderReport(currentJob)}
        </Card>

        <div style={{ display: "flex", gap: 12 }}>
          <Button icon={<ReloadOutlined />} onClick={reset}>Nouvel import</Button>
        </div>
      </Space>
    );
  }

  // ── Rapport détaillé (I-03 / I-07 / I-09) ─────────────────────────────────
  function renderReport(job: ImportJob) {
    const report = job.report;
    const issues = report?.issues ?? [];
    const counts = Object.entries(report?.assignment?.counts ?? {});
    const issueCols: ColumnsType<ImportIssue> = [
      { title: "Ligne", dataIndex: "row", key: "row", width: 80, sorter: (a, b) => a.row - b.row },
      {
        title: "Résultat", dataIndex: "action", key: "action", width: 120,
        filters: [{ text: "Rejetée", value: "rejected" }, { text: "Nettoyée", value: "cleaned" }],
        onFilter: (v, r) => r.action === v,
        render: (a: ImportIssue["action"]) => a === "rejected" ? <Tag color="red">Rejetée</Tag> : <Tag color="purple">Nettoyée</Tag>,
      },
      {
        title: "Colonne", dataIndex: "field", key: "field", width: 130,
        render: (f: ImportableField | null) => f ? IMPORTABLE_FIELD_LABELS[f] : <Text type="secondary">—</Text>,
      },
      { title: "Raison", dataIndex: "reason", key: "reason" },
    ];
    return (
      <Space direction="vertical" size="middle" style={{ width: "100%", marginTop: 16 }}>
        {(report?.requiredFields?.length ?? 0) > 0 && (
          <Text type="secondary">
            Colonnes obligatoires : {report!.requiredFields!.map((f) => <Tag key={f}>{IMPORTABLE_FIELD_LABELS[f]}</Tag>)}
          </Text>
        )}
        {counts.length > 0 && (
          <Alert
            type="info"
            showIcon
            message={report?.assignment?.mode === "roundRobin" ? "Leads répartis à tour de rôle" : "Leads assignés"}
            description={<Space wrap>{counts.map(([id, n]) => <Tag key={id} color="blue">{userName(id)} : {n}</Tag>)}</Space>}
          />
        )}
        {issues.length > 0 ? (
          <Collapse defaultActiveKey={job.errorRows > 0 ? ["issues"] : []} items={[{
            key: "issues",
            label: `Rapport d'import : ${job.errorRows} ligne(s) rejetée(s), ${job.cleanedRows ?? 0} nettoyée(s)${report?.truncated ? " — détail limité aux 2 000 premières anomalies" : ""}`,
            children: (
              <Table<ImportIssue>
                size="small"
                data-testid="import-report"
                rowKey={(r, i) => `${r.row}-${r.field ?? "row"}-${i}`}
                columns={issueCols}
                dataSource={issues}
                pagination={{ pageSize: 20, hideOnSinglePage: true }}
                scroll={{ x: "max-content" }}
              />
            ),
          }]} />
        ) : job.errorRows > 0 && job.errorReport ? (
          <Collapse items={[{
            key: "errors",
            label: `${job.errorRows} erreur(s) de ligne`,
            children: <pre style={{ maxHeight: 300, overflow: "auto", fontSize: 12 }}>{job.errorReport}</pre>,
          }]} />
        ) : null}
      </Space>
    );
  }

  // ── Historique ────────────────────────────────────────────────────────────
  function statusTag(s: string) {
    const map: Record<string, [string, string]> = {
      pending: ["En attente", "default"], running: ["En cours", "processing"],
      done: ["Terminé", "success"], failed: ["Échec", "error"],
    };
    const [label, color] = map[s] ?? [s, "default"];
    return <Badge status={color as "default" | "processing" | "success" | "error"} text={label} />;
  }

  async function deleteJob(id: string) {
    try {
      await api.delete(`/import/${id}`);
      void fetchHistory();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Erreur";
      message.error(msg);
    }
  }

  return (
    <Space direction="vertical" size="large" style={{ width: "100%" }}>
      <PageHeader
        icon={<CloudUploadOutlined />}
        title="Import de"
        highlight="leads"
        subtitle="CSV ou Excel : mapping des colonnes, dédoublonnage, traitement en tâche de fond."
        extra={
          <>
          <Tooltip title="Actualiser l&apos;historique">
            <Button icon={<ReloadOutlined />} onClick={() => fetchHistory()} loading={historyLoading} />
          </Tooltip>
          </>
        }
      />

      <Row gutter={[16, 24]}>
        <Col xs={24} lg={16}>
          <Steps
            current={step}
            direction={isMobile ? "vertical" : "horizontal"}
            size={isMobile ? "small" : "default"}
            style={{ marginBottom: isMobile ? 20 : 32 }}
            items={[
              { title: "Fichier" },
              { title: "Mapping" },
              { title: "Aperçu" },
              { title: "Traitement" },
            ]}
          />

          {step === 0 && renderUpload()}
          {step === 1 && renderMapping()}
          {step === 2 && renderPreview()}
          {step === 3 && renderProcessing()}
        </Col>

        <Col xs={24} lg={8}>
          <Card
            title={<Space><HistoryOutlined />Historique des imports</Space>}
            size="small"
            extra={<Button size="small" onClick={() => fetchHistory()} loading={historyLoading} icon={<ReloadOutlined />} />}
          >
            {history.length === 0 && !historyLoading && (
              <Text type="secondary">Aucun import pour l&apos;instant</Text>
            )}
            <List
              size="small"
              loading={historyLoading}
              dataSource={history}
              renderItem={(job) => (
                <List.Item
                  actions={[
                    <Tooltip key="del" title="Supprimer">
                      <Button
                        size="small" danger icon={<DeleteOutlined />}
                        disabled={job.status === "running"}
                        onClick={() => void deleteJob(job.id)}
                      />
                    </Tooltip>,
                  ]}
                >
                  <List.Item.Meta
                    title={<Text ellipsis style={{ maxWidth: 140 }}>{job.fileName}</Text>}
                    description={
                      <Space direction="vertical" size={0}>
                        {statusTag(job.status)}
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {new Date(job.createdAt).toLocaleString("fr-FR")}
                        </Text>
                        {job.status === "done" && (
                          <Text style={{ fontSize: 11 }}>
                            ✓ {job.importedRows} · ↯ {job.duplicateRows} · ✗ {job.errorRows}{job.cleanedRows ? ` · ✎ ${job.cleanedRows}` : ""}
                          </Text>
                        )}
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      <Divider />
      <Card size="small" title="Format attendu">
        <Paragraph style={{ marginBottom: 8 }}>
          Votre fichier CSV ou Excel peut contenir n&apos;importe quels en-têtes de colonnes.
          L&apos;étape de mapping vous permettra d&apos;associer chaque colonne au bon champ CRM.
        </Paragraph>
        <Space wrap>
          {LEAD_FIELDS.map(({ value, label }) => <Tag key={value}>{label}</Tag>)}
        </Space>
      </Card>
    </Space>
  );
}
