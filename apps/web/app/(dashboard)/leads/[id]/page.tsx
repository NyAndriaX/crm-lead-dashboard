"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, Descriptions, Timeline, Tag, Select, Button, Space, Typography, Progress, Skeleton, Result, Row, Col, Modal, Empty, Popconfirm, Form, Input, InputNumber, List, Upload } from "antd";
import {
  ArrowLeftOutlined, ReloadOutlined, MailOutlined, ThunderboltOutlined, DeleteOutlined,
  EuroOutlined, UploadOutlined, FileOutlined, SaveOutlined, RocketOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";
import { fetchTags } from "@/lib/tagsClient";
import SafeHtml from "@/components/SafeHtml";
import { LeadEnrichmentCard } from "@/components/leads/LeadEnrichmentCard";
import { STATUS_LABELS, STATUS_COLORS, allowedTransitions } from "@/lib/leadStatus";
import { LEAD_NOTE_LEGAL_BASES, legalBasisLabel } from "@/lib/leadLegalBasis";
import { useBreakpoint, useIsMobile } from "@/lib/responsive";
import type { LeadStatus } from "@crm/db";
import {
  applyApiFieldErrors,
  extractApiError,
  notifyApiError,
  notifyError,
  notifyInfo,
  notifySuccess,
  notifyWarning,
} from "@/lib/feedback";

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

interface LeadDTO {
  id: string; email: string | null; phone: string | null;
  firstName: string | null; lastName: string | null; company: string | null; website: string | null;
  sector: string | null; city: string | null; country: string | null; source: string | null;
  status: LeadStatus; emailStatus: string; score: number; tags: string[]; notes: string | null;
  businessPotentialEur: number | null; pipelineStageId: string | null;
  assignedToId: string | null; lastActionAt: string | null; lastReplyAt: string | null;
  enrichment: unknown;
  createdAt: string; updatedAt: string;
}
interface HistoryEntry { id: string; type: string; userId: string | null; payload: unknown; createdAt: string }
interface UserLite { id: string; name: string; email: string; role: string }
interface TagRef { id: string; name: string; color: string | null }
interface ThreadMessage {
  id: string;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  isAutoReply: boolean;
  receivedAt: string;
}

const HISTORY_LABELS: Record<string, string> = {
  created: "Lead créé", updated: "Modifié", status_change: "Changement de statut",
  assigned: "Assigné", unassigned: "Désassigné", tags_set: "Tags modifiés",
  soft_deleted: "Archivé", restored: "Restauré", recalc_score: "Score recalculé",
  note_added: "Note ajoutée", note_deleted: "Note supprimée",
  document_added: "Document ajouté", document_deleted: "Document supprimé",
  stage_change: "Changement de colonne", stage_and_status_change: "Colonne + statut",
};

function fullName(l: LeadDTO) {
  return [l.firstName, l.lastName].filter(Boolean).join(" ") || l.company || "Lead sans nom";
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [lead, setLead] = useState<LeadDTO | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [savingTags, setSavingTags] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagsRef, setTagsRef] = useState<TagRef[]>([]);
  const [aiRetryingId, setAiRetryingId] = useState<string | null>(null);
  const [aiNotice, setAiNotice] = useState<{ kind: "success" | "error" | "warning"; text: string } | null>(null);
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const [leadNotes, setLeadNotes] = useState<{ id: string; content: string; legalBasis: string | null; authorName: string | null; createdAt: string }[]>([]);
  const [documents, setDocuments] = useState<{ id: string; fileName: string; sizeBytes: number }[]>([]);
  const [potential, setPotential] = useState<number | null>(null);
  const [noteForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [savingLead, setSavingLead] = useState(false);
  const [leadCampaigns, setLeadCampaigns] = useState<{
    campaigns: { campaignId: string; campaignName: string; campaignStatus: string; sentAt: string | null; opens: number; clicks: number }[];
    sequences: { sequenceId: string; name: string; status: string; sentCount: number }[];
  } | null>(null);
  const isMobile = useIsMobile();
  const screens = useBreakpoint();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: l }, { data: h }, { data: t }, { data: n }, { data: d }, { data: camps }] = await Promise.all([
        api.get<LeadDTO>(`/leads/${id}`),
        api.get<{ data: HistoryEntry[] }>(`/leads/${id}/history`),
        api.get<{ data: ThreadMessage[] }>(`/leads/${id}/thread`),
        api.get<{ data: typeof leadNotes }>(`/leads/${id}/notes`),
        api.get<{ data: typeof documents }>(`/leads/${id}/documents`),
        api.get<{ data: typeof leadCampaigns }>(`/leads/${id}/campaigns`).catch(() => ({ data: { data: null } })),
      ]);
      setLead(l); setTags(l.tags); setPotential(l.businessPotentialEur);
      setHistory(h.data); setThread(t.data); setLeadNotes(n.data); setDocuments(d.data);
      setLeadCampaigns(camps.data);
      editForm.setFieldsValue({
        firstName: l.firstName, lastName: l.lastName, email: l.email, phone: l.phone,
        company: l.company, website: l.website, sector: l.sector, city: l.city, country: l.country,
        source: l.source, notes: l.notes,
      });
    } catch (e) {
      if ((e as { response?: { status?: number } }).response?.status === 404) setNotFound(true);
      else notifyApiError(e, "Impossible de charger le lead.");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { api.get<{ data: UserLite[] }>("/users").then((r) => setUsers(r.data.data)).catch(() => {}); }, []);
  useEffect(() => {
    void fetchTags().then(setTagsRef).catch(() => {});
  }, []);
  useEffect(() => {
    api.get<{ data: { id: string; name: string }[] }>("/pipeline-stages").then((r) => setStages(r.data.data)).catch(() => {});
  }, []);

  async function changeStatus(to: LeadStatus) {
    try {
      const { data } = await api.post<LeadDTO>(`/leads/${id}/status`, { status: to });
      setLead(data); notifySuccess(`Statut → ${STATUS_LABELS[to]} (pipeline synchronisé)`); void load();
    } catch (e) { notifyApiError(e, "Échec du changement de statut."); }
  }
  async function changePipelineStage(stageId: string) {
    try {
      await api.post(`/leads/${id}/pipeline-stage`, { stageId });
      notifySuccess("Colonne pipeline mise à jour"); void load();
    } catch (e) { notifyApiError(e, "Échec"); }
  }
  async function savePotential() {
    try {
      const { data } = await api.put<LeadDTO>(`/leads/${id}`, { businessPotentialEur: potential });
      setLead(data); notifySuccess("Potentiel enregistré");
    } catch (e) { notifyApiError(e, "Enregistrement impossible"); }
  }
  async function addNote() {
    const values = await noteForm.validateFields();
    try {
      await api.post(`/leads/${id}/notes`, values);
      noteForm.resetFields();
      notifySuccess("Note ajoutée");
      void load();
    } catch (e) { notifyApiError(e, "Impossible d'ajouter la note"); }
  }
  async function assign(userId: string | null) {
    try {
      const { data } = await api.post<LeadDTO>(`/leads/${id}/assign`, { assignedToId: userId });
      setLead(data); notifySuccess(userId ? "Lead assigné" : "Lead désassigné"); void load();
    } catch (e) { notifyApiError(e, "Échec de l'assignation."); }
  }
  async function saveLeadFields() {
    setSavingLead(true);
    try {
      const values = await editForm.validateFields();
      const { data } = await api.put<LeadDTO>(`/leads/${id}`, {
        ...values,
        email: values.email || null,
        phone: values.phone || null,
        website: values.website || null,
      });
      setLead(data);
      notifySuccess("Lead enregistré");
      void load();
    } catch (e) {
      applyApiFieldErrors(e, editForm);
      notifyApiError(e, "Enregistrement impossible");
    } finally {
      setSavingLead(false);
    }
  }

  async function deleteDocument(docId: string) {
    try {
      await api.delete(`/leads/${id}/documents/${docId}`);
      notifySuccess("Document supprimé");
      void load();
    } catch (e) { notifyApiError(e, "Suppression impossible"); }
  }

  async function saveTags() {
    setSavingTags(true);
    try {
      const { data } = await api.put<LeadDTO>(`/leads/${id}/tags`, { tags });
      setLead(data); notifySuccess("Tags enregistrés"); void load();
      void fetchTags().then(setTagsRef).catch(() => {});
    } catch (e) { notifyApiError(e, "Échec de l'enregistrement des tags."); }
    finally { setSavingTags(false); }
  }
  async function recalc() {
    try { const { data } = await api.post<{ score: number }>(`/leads/${id}/recalculate-score`); setLead((l) => (l ? { ...l, score: data.score } : l)); notifySuccess(`Score : ${data.score}`); }
    catch (e) { notifyApiError(e, "Échec du recalcul."); }
  }

  async function deleteThreadMessage(messageId: string) {
    try {
      await api.delete(`/inbox/${messageId}`);
      notifySuccess("Message supprimé");
      await load();
    } catch (e) {
      notifyApiError(e, "Suppression impossible");
    }
  }

  async function retryAiReply(messageId: string) {
    setAiRetryingId(messageId);
    setAiNotice(null);
    try {
      const { data } = await api.post<{
        data: { ok: boolean; acted: boolean; message: string };
      }>(`/inbox/${messageId}/auto-reply`);
      setAiNotice({
        kind: data.data.acted ? "success" : "warning",
        text: data.data.message,
      });
      await load();
    } catch (e) {
      notifyApiError(e, "Échec de la relance IA.");
      setAiNotice({
        kind: "error",
        text: extractApiError(e, "Échec de la relance IA."),
      });
    } finally {
      setAiRetryingId(null);
    }
  }
  function confirmDelete() {
    Modal.confirm({
      title: "Archiver ce lead ?", content: "Le lead sera soft-deleté (restaurable).", okText: "Archiver", okButtonProps: { danger: true },
      onOk: async () => { await api.delete(`/leads/${id}`); notifySuccess("Lead archivé"); void load(); },
    });
  }

  if (loading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (notFound || !lead) return <Result status="404" title="Lead introuvable" extra={<Link href="/leads"><Button type="primary">Retour à la liste</Button></Link>} />;

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <div className="page-stack page-stack-between">
        <Space wrap>
          <Link href="/leads"><Button icon={<ArrowLeftOutlined />}>Leads</Button></Link>
          <Title level={isMobile ? 4 : 3} style={{ margin: 0 }}>{fullName(lead)}</Title>
          <Tag color={STATUS_COLORS[lead.status]}>{STATUS_LABELS[lead.status]}</Tag>
        </Space>
        <Space wrap style={{ width: isMobile ? "100%" : undefined }}>
          <Select<LeadStatus>
            placeholder="Changer le statut" style={{ width: isMobile ? "100%" : 200 }} value={undefined}
            onChange={changeStatus}
            options={allowedTransitions(lead.status).map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          />
          {stages.length > 0 && (
            <Select
              placeholder="Colonne pipeline"
              style={{ width: isMobile ? "100%" : 200 }}
              value={lead.pipelineStageId ?? undefined}
              onChange={changePipelineStage}
              options={stages.map((s) => ({ value: s.id, label: s.name }))}
            />
          )}
          <Button type="primary" icon={<SaveOutlined />} loading={savingLead} onClick={() => void saveLeadFields()}>
            Enregistrer
          </Button>
          <Button danger onClick={confirmDelete} block={isMobile}>Archiver</Button>
        </Space>
      </div>

      <Row gutter={16}>
        <Col xs={24} lg={16}>
          <Card title="Coordonnées" size="small" style={{ marginBottom: 16 }}>
            <Form form={editForm} layout="vertical">
              <Row gutter={12}>
                <Col xs={24} sm={12}><Form.Item name="firstName" label="Prénom"><Input /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item name="lastName" label="Nom"><Input /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item name="email" label="Email" rules={[{ type: "email" }]}><Input /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item name="phone" label="Téléphone"><Input /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item name="company" label="Entreprise"><Input /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item name="website" label="Site web" rules={[{ type: "url" }]}><Input /></Form.Item></Col>
                <Col xs={24} sm={8}><Form.Item name="sector" label="Secteur"><Input /></Form.Item></Col>
                <Col xs={24} sm={8}><Form.Item name="city" label="Ville"><Input /></Form.Item></Col>
                <Col xs={24} sm={8}><Form.Item name="country" label="Pays"><Input /></Form.Item></Col>
                <Col xs={24} sm={12}><Form.Item name="source" label="Source"><Input /></Form.Item></Col>
                <Col xs={24}><Form.Item name="notes" label="Notes"><TextArea rows={2} /></Form.Item></Col>
              </Row>
            </Form>
            <Descriptions column={screens.md ? 2 : 1} size="small" style={{ marginTop: 8 }}>
              <Descriptions.Item label="Statut email">{lead.emailStatus}</Descriptions.Item>
              <Descriptions.Item label="Créé le">{new Date(lead.createdAt).toLocaleString("fr-FR")}</Descriptions.Item>
              <Descriptions.Item label="Dernière action">{lead.lastActionAt ? new Date(lead.lastActionAt).toLocaleString("fr-FR") : "—"}</Descriptions.Item>
            </Descriptions>
          </Card>

          <Card title={<><RocketOutlined /> Campagnes & relances</>} size="small" style={{ marginBottom: 16 }}>
            {!leadCampaigns || (leadCampaigns.campaigns.length === 0 && leadCampaigns.sequences.length === 0) ? (
              <Text type="secondary">Aucune campagne ou séquence associée.</Text>
            ) : (
              <Space direction="vertical" style={{ width: "100%" }}>
                {leadCampaigns.campaigns.map((c) => (
                  <div key={c.campaignId}>
                    <Text strong>{c.campaignName}</Text>{" "}
                    <Tag>{c.campaignStatus}</Tag>
                    <div><Text type="secondary" style={{ fontSize: 12 }}>
                      {c.sentAt ? `Envoyé le ${new Date(c.sentAt).toLocaleString("fr-FR")}` : "Non envoyé"} · {c.opens} ouv. · {c.clicks} clics
                    </Text></div>
                  </div>
                ))}
                {leadCampaigns.sequences.map((s) => (
                  <div key={s.sequenceId}>
                    <Text strong>Séquence : {s.name}</Text> <Tag>{s.status}</Tag>
                    <div><Text type="secondary" style={{ fontSize: 12 }}>{s.sentCount} email(s) envoyé(s)</Text></div>
                  </div>
                ))}
              </Space>
            )}
          </Card>

          <Card title="Historique" size="small" style={{ marginBottom: 16 }}>
            {history.length === 0 ? <Text type="secondary">Aucun événement.</Text> : (
              <Timeline
                items={history.map((h) => ({
                  children: (
                    <div>
                      <Text strong>{HISTORY_LABELS[h.type] ?? h.type}</Text>
                      <div><Text type="secondary" style={{ fontSize: 12 }}>{new Date(h.createdAt).toLocaleString("fr-FR")}</Text></div>
                      {!!(h.payload && Object.keys(h.payload as object).length > 0) && (
                        <pre style={{ fontSize: 12, margin: "4px 0 0", color: "#888" }}>{JSON.stringify(h.payload)}</pre>
                      )}
                    </div>
                  ),
                }))}
              />
            )}
          </Card>

          <Card
            title={<Space><MailOutlined /> Historique des échanges</Space>}
            size="small"
            extra={
              <Link href={`/inbox?leadId=${lead.id}`}>
                <Button size="small">Ouvrir la boîte</Button>
              </Link>
            }
          >
            {aiNotice ? (
              <div
                role="status"
                style={{
                  marginBottom: 12,
                  padding: "10px 12px",
                  borderRadius: 10,
                  fontWeight: 600,
                  background: aiNotice.kind === "success" ? "#f6ffed" : aiNotice.kind === "error" ? "#fff1f0" : "#fffbeb",
                  border: `1px solid ${aiNotice.kind === "success" ? "#b7eb8f" : aiNotice.kind === "error" ? "#ffa39e" : "#ffe58f"}`,
                  color: aiNotice.kind === "success" ? "#389e0d" : aiNotice.kind === "error" ? "#cf1322" : "#ad6800",
                }}
              >
                {aiNotice.text}
              </div>
            ) : null}
            {thread.length === 0 ? (
              <Empty
                description="Aucun email envoyé ou reçu pour ce lead."
                image={Empty.PRESENTED_IMAGE_SIMPLE}
              />
            ) : (
              <Space direction="vertical" size="small" style={{ width: "100%" }}>
                {thread.map((m) => (
                  <Card
                    key={m.id}
                    size="small"
                    style={{
                      background: m.direction === "outbound" ? "#fafafa" : "#fff",
                      borderLeft: m.direction === "outbound" ? "3px solid #1677ff" : "3px solid #52c41a",
                    }}
                    title={
                      <Space size={6} wrap>
                        <Tag color={m.direction === "outbound" ? "blue" : "green"}>
                          {m.direction === "outbound" ? "envoyé" : "reçu"}
                        </Tag>
                        {m.isAutoReply && <Tag color="default">auto-reply</Tag>}
                        <Text style={{ fontWeight: 500 }}>{m.subject ?? "(sans sujet)"}</Text>
                      </Space>
                    }
                    extra={
                      <Space size={8}>
                        {m.direction === "inbound" && !m.isAutoReply ? (
                          <Button
                            size="small"
                            type="primary"
                            icon={<ThunderboltOutlined />}
                            loading={aiRetryingId === m.id}
                            onClick={() => void retryAiReply(m.id)}
                          >
                            Relancer IA
                          </Button>
                        ) : null}
                        <Popconfirm
                          title="Supprimer ce message ?"
                          onConfirm={() => void deleteThreadMessage(m.id)}
                          okButtonProps={{ danger: true }}
                        >
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {new Date(m.receivedAt).toLocaleString("fr-FR")}
                        </Text>
                      </Space>
                    }
                  >
                    <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
                      {m.direction === "outbound" ? `→ ${m.to}` : `← ${m.from}`}
                    </div>
                    {m.bodyHtml ? (
                      <SafeHtml html={m.bodyHtml} style={{ maxHeight: 320, overflow: "auto" }} />
                    ) : (
                      <Paragraph style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                        {m.bodyText ?? <Text type="secondary">(corps vide)</Text>}
                      </Paragraph>
                    )}
                  </Card>
                ))}
              </Space>
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Score" size="small" style={{ marginBottom: 16 }} extra={<Button size="small" icon={<ReloadOutlined />} onClick={recalc}>Recalculer</Button>}>
            <Progress percent={lead.score} status={lead.score >= 70 ? "success" : lead.score >= 40 ? "active" : "normal"} />
          </Card>
          <Card title={<><EuroOutlined /> Potentiel (EUR)</>} size="small" style={{ marginBottom: 16 }}>
            <Space.Compact style={{ width: "100%" }}>
              <InputNumber
                min={0}
                precision={2}
                style={{ width: "100%" }}
                value={potential ?? undefined}
                onChange={(v) => setPotential(v ?? null)}
              />
              <Button type="primary" onClick={() => void savePotential()}>OK</Button>
            </Space.Compact>
          </Card>
          <Card title="Assignation" size="small" style={{ marginBottom: 16 }}>
            <Select<string>
              allowClear placeholder="Aucun commercial" style={{ width: "100%" }}
              value={lead.assignedToId ?? undefined}
              onChange={(v) => assign(v ?? null)}
              options={users.map((u) => ({ value: u.id, label: `${u.name} (${u.role})` }))}
            />
          </Card>
          <Card title="Tags" size="small">
            <Space direction="vertical" style={{ width: "100%" }} size={10}>
              {/* Tags actuels visualisés (couleurs du référentiel) */}
              {tags.length > 0 ? (
                <Space size={4} wrap>
                  {tags.map((t) => {
                    const ref = tagsRef.find((x) => x.name === t);
                    return (
                      <Tag
                        key={t}
                        color={ref?.color ?? "default"}
                        closable
                        onClose={(e) => { e.preventDefault(); setTags((cur) => cur.filter((x) => x !== t)); }}
                        style={{ margin: 0 }}
                      >
                        {t}
                      </Tag>
                    );
                  })}
                </Space>
              ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>Aucun tag</Text>
              )}

              {/* Select avec mode tags (autocomplete sur le référentiel + saisie libre) */}
              <Select<string[]>
                mode="tags"
                placeholder="Ajouter un tag…"
                style={{ width: "100%" }}
                value={tags}
                onChange={setTags}
                tokenSeparators={[","]}
                options={tagsRef.map((t) => ({
                  value: t.name,
                  label: <Tag color={t.color ?? "default"} style={{ margin: 0 }}>{t.name}</Tag>,
                }))}
                filterOption={(input, opt) =>
                  String(opt?.value ?? "").toLowerCase().includes(input.toLowerCase())
                }
              />

              {/* Suggestions rapides : tags du référentiel non encore appliqués */}
              {(() => {
                const suggestions = tagsRef.filter((t) => !tags.includes(t.name)).slice(0, 6);
                if (suggestions.length === 0) return null;
                return (
                  <div>
                    <Text type="secondary" style={{ fontSize: 11 }}>Suggestions :</Text>
                    <Space size={4} wrap style={{ marginTop: 4 }}>
                      {suggestions.map((t) => (
                        <Tag
                          key={t.id}
                          color={t.color ?? "default"}
                          style={{ cursor: "pointer", margin: 0 }}
                          onClick={() => setTags((cur) => Array.from(new Set([...cur, t.name])))}
                        >
                          + {t.name}
                        </Tag>
                      ))}
                    </Space>
                  </div>
                );
              })()}

              <Button
                size="small"
                type="primary"
                loading={savingTags}
                onClick={saveTags}
                disabled={JSON.stringify(tags) === JSON.stringify(lead.tags)}
              >
                Enregistrer les tags
              </Button>
            </Space>
          </Card>

          <Card title="Notes & base légale RGPD" size="small" style={{ marginBottom: 16 }}>
            <Form form={noteForm} layout="vertical">
              <Form.Item name="content" rules={[{ required: true, message: "Requis" }]}>
                <TextArea rows={2} placeholder="Nouvelle note…" />
              </Form.Item>
              <Form.Item name="legalBasis" label="Base légale">
                <Select allowClear placeholder="RGPD" options={LEAD_NOTE_LEGAL_BASES.map((b) => ({ value: b.value, label: b.label }))} />
              </Form.Item>
              <Button size="small" type="dashed" block onClick={() => void addNote()}>Ajouter</Button>
            </Form>
            <List
              size="small"
              style={{ marginTop: 8 }}
              dataSource={leadNotes}
              locale={{ emptyText: "Aucune note" }}
              renderItem={(n) => (
                <List.Item>
                  <List.Item.Meta
                    title={<Text style={{ fontSize: 11 }}>{legalBasisLabel(n.legalBasis)} · {new Date(n.createdAt).toLocaleString("fr-FR")}</Text>}
                    description={n.content}
                  />
                </List.Item>
              )}
            />
          </Card>

          <Card title={<><FileOutlined /> Documents</>} size="small" style={{ marginBottom: 16 }}>
            <Upload
              customRequest={async ({ file, onSuccess, onError }) => {
                try {
                  const fd = new FormData();
                  fd.append("file", file as File);
                  await api.post(`/leads/${id}/documents`, fd, { headers: { "Content-Type": "multipart/form-data" } });
                  notifySuccess("Document ajouté");
                  void load();
                  onSuccess?.(file);
                } catch (e) {
                  notifyApiError(e, "Impossible d'ajouter le document");
                  onError?.(e as Error);
                }
              }}
              showUploadList={false}
            >
              <Button size="small" icon={<UploadOutlined />}>Joindre</Button>
            </Upload>
            <List
              size="small"
              dataSource={documents}
              locale={{ emptyText: "Aucun document" }}
              renderItem={(d) => (
                <List.Item
                  actions={[
                    <Popconfirm key="del" title="Supprimer ce document ?" onConfirm={() => void deleteDocument(d.id)}>
                      <Button size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>,
                  ]}
                >
                  <a href={`/api/leads/${id}/documents/${d.id}`} download={d.fileName}>{d.fileName}</a>
                </List.Item>
              )}
            />
          </Card>

          <LeadEnrichmentCard
            leadId={lead.id}
            enrichment={lead.enrichment}
            onEnriched={() => void load()}
          />
        </Col>
      </Row>
    </Space>
  );
}
