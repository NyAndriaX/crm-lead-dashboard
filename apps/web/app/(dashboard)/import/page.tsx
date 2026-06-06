"use client";

/**
 * Page Import CSV/XLSX — CRM-021 → CRM-027.
 * Wizard en 4 étapes :
 *  1. Upload du fichier
 *  2. Mapping colonnes ↔ champs lead
 *  3. Aperçu + confirmation
 *  4. Traitement en cours + résultat
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Steps, Upload, Button, Typography, Table, Select, Space, Card, Alert, Progress,
  Row, Col, Tag, Badge, Divider, Tooltip, message, Collapse, Statistic, List,
  Switch, Input,
} from "antd";
import {
  InboxOutlined, ArrowLeftOutlined, ArrowRightOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ReloadOutlined, DeleteOutlined, HistoryOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { api } from "@/lib/client";
import { IMPORTABLE_FIELD_LABELS, type ImportableField } from "@/lib/schemas/import";
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

interface ImportJob {
  id: string;
  fileName: string;
  status: string;
  totalRows: number;
  importedRows: number;
  duplicateRows: number;
  errorRows: number;
  errorReport: string | null;
  createdAt: string;
  user?: { id: string; name: string };
}

type Mapping = Partial<Record<ImportableField, string>>;

export default function ImportPage() {
  const [step, setStep] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [defaultSource, setDefaultSource] = useState("");
  const [defaultTags, setDefaultTags] = useState<string[]>([]);
  const [tagsRef, setTagsRef] = useState<{ name: string }[]>([]);
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
    api.get<{ data: { name: string }[] }>("/tags").then((r) => setTagsRef(r.data.data ?? [])).catch(() => {});
  }, []);

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
    setStarting(true);
    try {
      const { data } = await api.post<{ data: ImportJob }>(`/import/${uploadResult.id}/start`, {
        mapping,
        skipDuplicates,
        defaultSource: defaultSource || undefined,
        defaultTags: defaultTags.length ? defaultTags : undefined,
      });
      setCurrentJob(data.data);
      setStep(4);
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
    setSkipDuplicates(true);
  }

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
            <p className="ant-upload-drag-icon"><InboxOutlined style={{ fontSize: 48, color: "#1677ff" }} /></p>
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

        <Card title="Options d'import">
          <Space direction="vertical" size="small">
            <Space>
              <Switch checked={skipDuplicates} onChange={setSkipDuplicates} />
              <Text>Ignorer les doublons (même email)</Text>
            </Space>
            <Space>
              <Text>Source par défaut :</Text>
              <Input
                value={defaultSource}
                onChange={(e) => setDefaultSource(e.target.value)}
                placeholder="CSV import, salon…"
                style={{ width: 220 }}
              />
            </Space>
          </Space>
        </Card>

        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => setStep(0)} block={isMobile}>Retour</Button>
          <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => setStep(2)} block={isMobile}>
            Tags & options ({Object.values(mapping).filter(Boolean).length} colonne(s) mappée(s))
          </Button>
        </div>
      </Space>
    );
  }

  // ── Step 3 : Tags ─────────────────────────────────────────────────────────
  function renderTags() {
    return (
      <Space direction="vertical" size="middle" style={{ width: "100%" }}>
        <Alert
          message="Tags appliqués à tous les leads importés"
          description="Ces tags seront ajoutés à chaque lead créé lors de l'import. Vous pouvez en sélectionner dans le référentiel ou en créer de nouveaux."
          type="info"
          showIcon
        />
        <Card title="Tags de l'import">
          <Select
            mode="tags"
            style={{ width: "100%" }}
            placeholder="Ex: salon-2026, import-csv, secteur-it…"
            value={defaultTags}
            onChange={setDefaultTags}
            options={tagsRef.map((t) => ({ label: t.name, value: t.name }))}
            tokenSeparators={[","]}
          />
          {defaultTags.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <Space wrap>
                {defaultTags.map((t) => (
                  <Tag key={t} color="blue">{t}</Tag>
                ))}
              </Space>
            </div>
          )}
        </Card>
        <Card title="Rappel des options">
          <Space direction="vertical">
            <Text>
              <Text strong>Ignorer les doublons :</Text> {skipDuplicates ? "Oui" : "Non"}
            </Text>
            <Text>
              <Text strong>Source par défaut :</Text> {defaultSource || "—"}
            </Text>
          </Space>
        </Card>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => setStep(1)} block={isMobile}>Retour au mapping</Button>
          <Button type="primary" icon={<ArrowRightOutlined />} onClick={() => setStep(3)} block={isMobile}>
            Aperçu
          </Button>
        </div>
      </Space>
    );
  }

  // ── Step 4 : Aperçu ───────────────────────────────────────────────────────
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
        {defaultTags.length > 0 && (
          <Alert
            message={`Tags appliqués : ${defaultTags.join(", ")}`}
            type="success"
            showIcon
          />
        )}

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
          <Button icon={<ArrowLeftOutlined />} onClick={() => setStep(2)} block={isMobile}>Modifier les tags</Button>
          <Button type="primary" loading={starting} onClick={handleStart} block={isMobile}>
            Lancer l&apos;import ({uploadResult.totalRows} ligne(s))
          </Button>
        </div>
      </Space>
    );
  }

  // ── Step 5 : Traitement ───────────────────────────────────────────────────
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
              <Progress percent={pct} status="active" strokeColor="#1677ff" />
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
                    <Col><Statistic title="Importés" value={currentJob.importedRows} valueStyle={{ color: "#52c41a" }} /></Col>
                    <Col><Statistic title="Doublons ignorés" value={currentJob.duplicateRows} valueStyle={{ color: "#faad14" }} /></Col>
                    <Col><Statistic title="Erreurs" value={currentJob.errorRows} valueStyle={{ color: currentJob.errorRows > 0 ? "#ff4d4f" : undefined }} /></Col>
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

          {isDone && currentJob.errorRows > 0 && currentJob.errorReport && (
            <Collapse style={{ marginTop: 16 }} items={[{
              key: "errors",
              label: `${currentJob.errorRows} erreur(s) de ligne`,
              children: <pre style={{ maxHeight: 300, overflow: "auto", fontSize: 12 }}>{currentJob.errorReport}</pre>,
            }]} />
          )}
        </Card>

        <div style={{ display: "flex", gap: 12 }}>
          <Button icon={<ReloadOutlined />} onClick={reset}>Nouvel import</Button>
        </div>
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
      <div className="page-toolbar">
        <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>Import de leads</Title>
        <div className="page-toolbar-actions">
          <Tooltip title="Actualiser l&apos;historique">
            <Button icon={<ReloadOutlined />} onClick={() => fetchHistory()} loading={historyLoading} />
          </Tooltip>
        </div>
      </div>

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
              { title: "Tags" },
              { title: "Aperçu" },
              { title: "Traitement" },
            ]}
          />

          {step === 0 && renderUpload()}
          {step === 1 && renderMapping()}
          {step === 2 && renderTags()}
          {step === 3 && renderPreview()}
          {step === 4 && renderProcessing()}
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
                            ✓ {job.importedRows} · ↯ {job.duplicateRows} · ✗ {job.errorRows}
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
