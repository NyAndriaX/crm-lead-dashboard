"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Card, Descriptions, Timeline, Tag, Select, Button, Space, Typography, Progress,
  message, Skeleton, Result, Row, Col, Modal,
} from "antd";
import { ArrowLeftOutlined, ReloadOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";
import { STATUS_LABELS, STATUS_COLORS, allowedTransitions } from "@/lib/leadStatus";
import type { LeadStatus } from "@crm/db";

const { Title, Text, Paragraph } = Typography;

interface LeadDTO {
  id: string; email: string | null; phone: string | null;
  firstName: string | null; lastName: string | null; company: string | null; website: string | null;
  sector: string | null; city: string | null; country: string | null; source: string | null;
  status: LeadStatus; emailStatus: string; score: number; tags: string[]; notes: string | null;
  assignedToId: string | null; lastActionAt: string | null; lastReplyAt: string | null;
  createdAt: string; updatedAt: string;
}
interface HistoryEntry { id: string; type: string; userId: string | null; payload: unknown; createdAt: string }
interface UserLite { id: string; name: string; email: string; role: string }

const HISTORY_LABELS: Record<string, string> = {
  created: "Lead créé", updated: "Modifié", status_change: "Changement de statut",
  assigned: "Assigné", unassigned: "Désassigné", tags_set: "Tags modifiés",
  soft_deleted: "Archivé", restored: "Restauré", recalc_score: "Score recalculé",
};

function fullName(l: LeadDTO) {
  return [l.firstName, l.lastName].filter(Boolean).join(" ") || l.company || "Lead sans nom";
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [lead, setLead] = useState<LeadDTO | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [users, setUsers] = useState<UserLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [savingTags, setSavingTags] = useState(false);
  const [tags, setTags] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: l }, { data: h }] = await Promise.all([
        api.get<LeadDTO>(`/leads/${id}`),
        api.get<{ data: HistoryEntry[] }>(`/leads/${id}/history`),
      ]);
      setLead(l); setTags(l.tags); setHistory(h.data);
    } catch (e) {
      if ((e as { response?: { status?: number } }).response?.status === 404) setNotFound(true);
      else message.error("Impossible de charger le lead.");
    } finally { setLoading(false); }
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { api.get<{ data: UserLite[] }>("/users").then((r) => setUsers(r.data.data)).catch(() => {}); }, []);

  async function changeStatus(to: LeadStatus) {
    try {
      const { data } = await api.post<LeadDTO>(`/leads/${id}/status`, { status: to });
      setLead(data); message.success(`Statut → ${STATUS_LABELS[to]}`); void load();
    } catch (e) { message.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Échec du changement de statut."); }
  }
  async function assign(userId: string | null) {
    try {
      const { data } = await api.post<LeadDTO>(`/leads/${id}/assign`, { assignedToId: userId });
      setLead(data); message.success(userId ? "Lead assigné" : "Lead désassigné"); void load();
    } catch { message.error("Échec de l'assignation."); }
  }
  async function saveTags() {
    setSavingTags(true);
    try {
      const { data } = await api.put<LeadDTO>(`/leads/${id}/tags`, { tags });
      setLead(data); message.success("Tags enregistrés"); void load();
    } catch { message.error("Échec de l'enregistrement des tags."); }
    finally { setSavingTags(false); }
  }
  async function recalc() {
    try { const { data } = await api.post<{ score: number }>(`/leads/${id}/recalculate-score`); setLead((l) => (l ? { ...l, score: data.score } : l)); message.success(`Score : ${data.score}`); }
    catch { message.error("Échec du recalcul."); }
  }
  function confirmDelete() {
    Modal.confirm({
      title: "Archiver ce lead ?", content: "Le lead sera soft-deleté (restaurable).", okText: "Archiver", okButtonProps: { danger: true },
      onOk: async () => { await api.delete(`/leads/${id}`); message.success("Lead archivé"); void load(); },
    });
  }

  if (loading) return <Skeleton active paragraph={{ rows: 8 }} />;
  if (notFound || !lead) return <Result status="404" title="Lead introuvable" extra={<Link href="/leads"><Button type="primary">Retour à la liste</Button></Link>} />;

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Space style={{ width: "100%", justifyContent: "space-between" }}>
        <Space>
          <Link href="/leads"><Button icon={<ArrowLeftOutlined />}>Leads</Button></Link>
          <Title level={3} style={{ margin: 0 }}>{fullName(lead)}</Title>
          <Tag color={STATUS_COLORS[lead.status]}>{STATUS_LABELS[lead.status]}</Tag>
        </Space>
        <Space>
          <Select<LeadStatus>
            placeholder="Changer le statut" style={{ width: 200 }} value={undefined}
            onChange={changeStatus}
            options={allowedTransitions(lead.status).map((s) => ({ value: s, label: STATUS_LABELS[s] }))}
          />
          <Button danger onClick={confirmDelete}>Archiver</Button>
        </Space>
      </Space>

      <Row gutter={16}>
        <Col xs={24} lg={16}>
          <Card title="Coordonnées" size="small" style={{ marginBottom: 16 }}>
            <Descriptions column={2} size="small">
              <Descriptions.Item label="Prénom">{lead.firstName ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Nom">{lead.lastName ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Email">{lead.email ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Téléphone">{lead.phone ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Entreprise">{lead.company ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Site web">{lead.website ? <a href={lead.website} target="_blank" rel="noreferrer">{lead.website}</a> : "—"}</Descriptions.Item>
              <Descriptions.Item label="Secteur">{lead.sector ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Localisation">{[lead.city, lead.country].filter(Boolean).join(", ") || "—"}</Descriptions.Item>
              <Descriptions.Item label="Source">{lead.source ?? "—"}</Descriptions.Item>
              <Descriptions.Item label="Statut email">{lead.emailStatus}</Descriptions.Item>
              <Descriptions.Item label="Créé le">{new Date(lead.createdAt).toLocaleString("fr-FR")}</Descriptions.Item>
              <Descriptions.Item label="Dernière action">{lead.lastActionAt ? new Date(lead.lastActionAt).toLocaleString("fr-FR") : "—"}</Descriptions.Item>
            </Descriptions>
            {lead.notes && <Paragraph style={{ marginTop: 12 }}><Text type="secondary">Notes :</Text><br />{lead.notes}</Paragraph>}
          </Card>

          <Card title="Historique" size="small">
            {history.length === 0 ? <Text type="secondary">Aucun événement.</Text> : (
              <Timeline
                items={history.map((h) => ({
                  children: (
                    <div>
                      <Text strong>{HISTORY_LABELS[h.type] ?? h.type}</Text>
                      <div><Text type="secondary" style={{ fontSize: 12 }}>{new Date(h.createdAt).toLocaleString("fr-FR")}</Text></div>
                      {h.payload && Object.keys(h.payload as object).length > 0 && (
                        <pre style={{ fontSize: 12, margin: "4px 0 0", color: "#888" }}>{JSON.stringify(h.payload)}</pre>
                      )}
                    </div>
                  ),
                }))}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Score" size="small" style={{ marginBottom: 16 }} extra={<Button size="small" icon={<ReloadOutlined />} onClick={recalc}>Recalculer</Button>}>
            <Progress percent={lead.score} status={lead.score >= 70 ? "success" : lead.score >= 40 ? "active" : "normal"} />
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
            <Space direction="vertical" style={{ width: "100%" }}>
              <Select<string[]>
                mode="tags" placeholder="Ajouter des tags…" style={{ width: "100%" }}
                value={tags} onChange={setTags} tokenSeparators={[","]}
              />
              <Button size="small" type="primary" loading={savingTags} onClick={saveTags} disabled={JSON.stringify(tags) === JSON.stringify(lead.tags)}>
                Enregistrer les tags
              </Button>
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
