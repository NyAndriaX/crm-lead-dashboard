"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Descriptions, Drawer, Form, Input, InputNumber, List, Select, Space, Tag, Typography, Upload, Popconfirm } from "antd";
import {
  DeleteOutlined, EuroOutlined, FileOutlined, LinkOutlined, UploadOutlined,
} from "@ant-design/icons";
import Link from "next/link";
import { api } from "@/lib/client";
import { LEAD_NOTE_LEGAL_BASES, legalBasisLabel } from "@/lib/leadLegalBasis";
import { STATUS_COLORS, STATUS_LABELS, allowedTransitions } from "@/lib/leadStatus";
import type { LeadStatus } from "@crm/db";
import { notifyApiError, notifyError, notifyInfo, notifySuccess, notifyWarning } from "@/lib/feedback";

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

type Stage = { id: string; name: string; color: string | null };

type LeadDetail = {
  id: string;
  email: string | null;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  status: LeadStatus;
  score: number;
  tags: string[];
  businessPotentialEur: number | null;
  pipelineStageId: string | null;
  source: string | null;
  notes: string | null;
};

type LeadNote = {
  id: string;
  content: string;
  legalBasis: string | null;
  authorName: string | null;
  createdAt: string;
};

type LeadDocument = {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
};

function fullName(l: LeadDetail): string {
  return [l.firstName, l.lastName].filter(Boolean).join(" ") || l.company || "(sans nom)";
}

export function LeadPipelineDrawer({
  leadId,
  open,
  onClose,
  stages,
  onUpdated,
}: {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
  stages: Stage[];
  onUpdated?: () => void;
}) {
  const [lead, setLead] = useState<LeadDetail | null>(null);
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [documents, setDocuments] = useState<LeadDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [noteForm] = Form.useForm();
  const [savingPotential, setSavingPotential] = useState(false);
  const [potential, setPotential] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!leadId) return;
    setLoading(true);
    try {
      const [l, n, d] = await Promise.all([
        api.get<LeadDetail>(`/leads/${leadId}`),
        api.get<{ data: LeadNote[] }>(`/leads/${leadId}/notes`),
        api.get<{ data: LeadDocument[] }>(`/leads/${leadId}/documents`),
      ]);
      setLead(l.data);
      setPotential(l.data.businessPotentialEur);
      setNotes(n.data.data);
      setDocuments(d.data.data);
    } catch (e) { notifyApiError(e, "Impossible de charger le lead."); } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    if (open && leadId) void load();
  }, [open, leadId, load]);

  async function changeStatus(status: LeadStatus) {
    if (!leadId) return;
    try {
      const { data } = await api.post<LeadDetail>(`/leads/${leadId}/status`, { status });
      setLead(data);
      notifySuccess(`Statut → ${STATUS_LABELS[status]}`);
      onUpdated?.();
      void load();
    } catch (e) { notifyApiError(e, "Échec"); }
  }

  async function changeStage(stageId: string) {
    if (!leadId) return;
    try {
      await api.post(`/leads/${leadId}/pipeline-stage`, { stageId });
      notifySuccess("Colonne pipeline mise à jour");
      onUpdated?.();
      void load();
    } catch (e) { notifyApiError(e, "Échec"); }
  }

  async function savePotential() {
    if (!leadId) return;
    setSavingPotential(true);
    try {
      const { data } = await api.put<LeadDetail>(`/leads/${leadId}`, {
        businessPotentialEur: potential,
      });
      setLead(data);
      notifySuccess("Potentiel enregistré");
      onUpdated?.();
    } catch (e) { notifyApiError(e, "Enregistrement impossible"); } finally {
      setSavingPotential(false);
    }
  }

  async function addNote() {
    if (!leadId) return;
    const values = await noteForm.validateFields();
    try {
      await api.post(`/leads/${leadId}/notes`, values);
      noteForm.resetFields();
      notifySuccess("Note ajoutée");
      void load();
      onUpdated?.();
    } catch (e) { notifyApiError(e, "Impossible d'ajouter la note"); }
  }

  async function removeNote(noteId: string) {
    if (!leadId) return;
    try {
      await api.delete(`/leads/${leadId}/notes/${noteId}`);
      void load();
    } catch (e) { notifyApiError(e, "Suppression impossible"); }
  }

  return (
    <Drawer
      title={lead ? fullName(lead) : "Détail lead"}
      open={open}
      onClose={onClose}
      width={520}
      destroyOnClose
      extra={
        leadId ? (
          <Link href={`/leads/${leadId}`} target="_blank">
            <Button type="link" icon={<LinkOutlined />} size="small">
              Fiche complète
            </Button>
          </Link>
        ) : null
      }
    >
      {loading && !lead ? (
        <Text type="secondary">Chargement…</Text>
      ) : lead ? (
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="Entreprise">{lead.company ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Email">{lead.email ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="Statut">
              <Tag color={STATUS_COLORS[lead.status]}>{STATUS_LABELS[lead.status]}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Score">{lead.score}</Descriptions.Item>
          </Descriptions>

          <div>
            <Text strong>Changer le statut</Text>
            <Select
              style={{ width: "100%", marginTop: 8 }}
              placeholder="Nouveau statut"
              value={undefined}
              onChange={changeStatus}
              options={allowedTransitions(lead.status).map((s) => ({
                value: s,
                label: STATUS_LABELS[s],
              }))}
            />
          </div>

          <div>
            <Text strong>Colonne pipeline</Text>
            <Select
              style={{ width: "100%", marginTop: 8 }}
              value={lead.pipelineStageId ?? undefined}
              onChange={changeStage}
              options={stages.map((s) => ({
                value: s.id,
                label: s.name,
              }))}
            />
          </div>

          <div>
            <Text strong><EuroOutlined /> Potentiel commercial (EUR)</Text>
            <Space style={{ width: "100%", marginTop: 8 }}>
              <InputNumber
                min={0}
                precision={2}
                style={{ flex: 1, width: "100%" }}
                value={potential ?? undefined}
                onChange={(v) => setPotential(v ?? null)}
                formatter={(v) => (v ? `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : "")}
                parser={(v) => Number(v?.replace(/\s/g, "").replace(",", ".") ?? 0)}
              />
              <Button type="primary" loading={savingPotential} onClick={() => void savePotential()}>
                Enregistrer
              </Button>
            </Space>
          </div>

          {lead.notes && (
            <Paragraph type="secondary" style={{ marginBottom: 0 }}>
              Note legacy : {lead.notes}
            </Paragraph>
          )}

          <div>
            <Text strong>Notes (avec base légale RGPD)</Text>
            <Form form={noteForm} layout="vertical" style={{ marginTop: 8 }}>
              <Form.Item name="content" rules={[{ required: true, message: "Contenu requis" }]}>
                <TextArea rows={3} placeholder="Compte-rendu d'appel, contexte…" maxLength={10000} />
              </Form.Item>
              <Form.Item name="legalBasis" label="Base légale">
                <Select
                  allowClear
                  placeholder="Choisir la base légale"
                  options={LEAD_NOTE_LEGAL_BASES.map((b) => ({ value: b.value, label: b.label }))}
                />
              </Form.Item>
              <Button type="dashed" block onClick={() => void addNote()}>
                Ajouter la note
              </Button>
            </Form>
            <List
              size="small"
              style={{ marginTop: 12 }}
              dataSource={notes}
              locale={{ emptyText: "Aucune note" }}
              renderItem={(n) => (
                <List.Item
                  actions={[
                    <Popconfirm key="del" title="Supprimer cette note ?" onConfirm={() => void removeNote(n.id)}>
                      <Button type="text" danger size="small" icon={<DeleteOutlined />} />
                    </Popconfirm>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space size={4} wrap>
                        <Text style={{ fontSize: 12 }}>{new Date(n.createdAt).toLocaleString("fr-FR")}</Text>
                        {n.legalBasis && <Tag style={{ fontSize: 10 }}>{legalBasisLabel(n.legalBasis)}</Tag>}
                      </Space>
                    }
                    description={<Paragraph style={{ margin: 0, whiteSpace: "pre-wrap" }}>{n.content}</Paragraph>}
                  />
                </List.Item>
              )}
            />
          </div>

          <div>
            <Text strong><FileOutlined /> Documents</Text>
            <Upload
              customRequest={async ({ file, onSuccess, onError }) => {
                try {
                  const fd = new FormData();
                  fd.append("file", file as File);
                  await api.post(`/leads/${leadId}/documents`, fd, {
                    headers: { "Content-Type": "multipart/form-data" },
                  });
                  notifySuccess("Document ajouté");
                  void load();
                  onUpdated?.();
                  onSuccess?.(file);
                } catch (e) {
                  notifyApiError(e, "Impossible d'ajouter le document");
                  onError?.(e as Error);
                }
              }}
              showUploadList={false}
            >
              <Button icon={<UploadOutlined />} style={{ marginTop: 8 }}>
                Joindre un document
              </Button>
            </Upload>
            <List
              size="small"
              style={{ marginTop: 12 }}
              dataSource={documents}
              locale={{ emptyText: "Aucun document" }}
              renderItem={(d) => (
                <List.Item
                  actions={[
                    <a key="dl" href={`/api/leads/${leadId}/documents/${d.id}`} download={d.fileName}>
                      Télécharger
                    </a>,
                  ]}
                >
                  <Text>{d.fileName}</Text>
                  <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                    ({Math.round(d.sizeBytes / 1024)} Ko)
                  </Text>
                </List.Item>
              )}
            />
          </div>
        </Space>
      ) : null}
    </Drawer>
  );
}
