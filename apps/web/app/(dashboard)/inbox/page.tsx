"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Table, Input, Select, Tag, Space, Button, Badge, Drawer, Typography, Divider, Form,
  message, Tooltip, Switch, Empty, Card,
} from "antd";
import { ReloadOutlined, MailOutlined, CheckOutlined, SendOutlined, TagsOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";
import SafeHtml from "@/components/SafeHtml";
import { STATUS_LABELS, STATUS_COLORS } from "@/lib/leadStatus";
import type { LeadStatus } from "@crm/db";

const { Title, Text, Paragraph } = Typography;

type InboxItem = {
  id: string;
  leadId: string | null;
  lead: { id: string; firstName: string | null; lastName: string | null; company: string | null; status: LeadStatus } | null;
  messageId: string;
  inReplyTo: string | null;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  subject: string | null;
  preview: string | null;
  category: string | null;
  isAutoReply: boolean;
  isRead: boolean;
  receivedAt: string;
};

const CATEGORY_LABEL: Record<string, string> = {
  interesse: "Intéressé",
  pas_interesse: "Pas intéressé",
  hors_sujet: "Hors sujet",
  rappel: "Demande de rappel",
  auto_reply: "Auto-reply",
};
const CATEGORY_COLOR: Record<string, string> = {
  interesse: "green",
  pas_interesse: "red",
  hors_sujet: "default",
  rappel: "orange",
  auto_reply: "default",
};

type ThreadItem = InboxItem & { bodyText: string | null; bodyHtml: string | null };
type SmtpOption = { id: string; label: string; fromEmail: string | null };

function leadName(it: InboxItem): string {
  if (!it.lead) return "(non rattaché)";
  return [it.lead.firstName, it.lead.lastName].filter(Boolean).join(" ") || it.lead.company || "(sans nom)";
}

export default function InboxPage() {
  const [data, setData] = useState<InboxItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [view, setView] = useState<"replies" | "unmatched" | "auto" | "all">("replies");
  const [loading, setLoading] = useState(false);
  const [opened, setOpened] = useState<ThreadItem | null>(null);
  const [thread, setThread] = useState<ThreadItem[]>([]);
  const [smtpOpts, setSmtpOpts] = useState<SmtpOption[]>([]);
  const [form] = Form.useForm();
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (search.trim()) params.set("search", search.trim());
      if (unreadOnly) params.set("unreadOnly", "true");
      params.set("view", view);
      const r = await api.get<{ data: InboxItem[]; total: number }>(`/inbox?${params.toString()}`);
      setData(r.data.data);
      setTotal(r.data.total);
    } catch {
      message.error("Impossible de charger la boîte de réception.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, unreadOnly, view]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    api.get<{ data: SmtpOption[] }>("/smtp-configs?active=true").then((r) => setSmtpOpts(r.data.data)).catch(() => {});
  }, []);

  async function openItem(item: InboxItem) {
    try {
      const r = await api.get<{ data: ThreadItem }>(`/inbox/${item.id}`);
      setOpened(r.data.data);
      if (!item.isRead) {
        await api.patch(`/inbox/${item.id}`, { isRead: true });
        setData((rows) => rows.map((x) => (x.id === item.id ? { ...x, isRead: true } : x)));
      }
      if (item.leadId) {
        const t = await api.get<{ data: ThreadItem[] }>(`/leads/${item.leadId}/thread`);
        setThread(t.data.data);
      } else {
        setThread([r.data.data]);
      }
      form.resetFields();
      const replySubj = item.subject ? (item.subject.startsWith("Re:") ? item.subject : `Re: ${item.subject}`) : "";
      form.setFieldsValue({ subject: replySubj });
    } catch {
      message.error("Impossible d'ouvrir le message.");
    }
  }

  async function toggleRead(item: InboxItem) {
    try {
      await api.patch(`/inbox/${item.id}`, { isRead: !item.isRead });
      setData((rows) => rows.map((x) => (x.id === item.id ? { ...x, isRead: !x.isRead } : x)));
    } catch {
      message.error("Échec de la mise à jour.");
    }
  }

  async function recategorize(item: InboxItem) {
    try {
      const { data } = await api.post<{ data: { id: string; category: string; source: string } }>(
        `/inbox/${item.id}/categorize`,
      );
      setData((rows) => rows.map((x) => (x.id === item.id ? { ...x, category: data.data.category } : x)));
      message.success(`Catégorie : ${CATEGORY_LABEL[data.data.category] ?? data.data.category} (${data.data.source})`);
    } catch {
      message.error("Échec de la catégorisation.");
    }
  }

  async function submitReply() {
    if (!opened) return;
    try {
      const values = await form.validateFields();
      setSending(true);
      await api.post(`/inbox/${opened.id}/reply`, values);
      message.success("Réponse envoyée");
      form.resetFields();
      if (opened.leadId) {
        const t = await api.get<{ data: ThreadItem[] }>(`/leads/${opened.leadId}/thread`);
        setThread(t.data.data);
      }
      await load();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      if (msg) message.error(msg);
    } finally {
      setSending(false);
    }
  }

  const columns = [
    {
      title: "",
      key: "unread",
      width: 30,
      render: (_: unknown, r: InboxItem) =>
        r.isRead ? null : <Badge color="#1677ff" />,
    },
    {
      title: "Expéditeur",
      dataIndex: "from",
      width: 240,
      render: (v: string, r: InboxItem) => (
        <Space direction="vertical" size={0}>
          <Text strong={!r.isRead}>{v}</Text>
          {r.lead ? (
            <Link href={`/leads/${r.lead.id}`}>
              <Tag color={STATUS_COLORS[r.lead.status]} style={{ marginTop: 2 }}>
                {leadName(r)} · {STATUS_LABELS[r.lead.status]}
              </Tag>
            </Link>
          ) : (
            <Tag>non rattaché</Tag>
          )}
        </Space>
      ),
    },
    {
      title: "Sujet & aperçu",
      key: "subject",
      render: (_: unknown, r: InboxItem) => (
        <div>
          <Space size={6} wrap>
            <Text strong={!r.isRead}>{r.subject ?? "(sans sujet)"}</Text>
            {r.category && (
              <Tag color={CATEGORY_COLOR[r.category] ?? "default"} style={{ margin: 0 }}>
                {CATEGORY_LABEL[r.category] ?? r.category}
              </Tag>
            )}
            {r.isAutoReply && <Tag color="default" style={{ margin: 0 }}>auto-reply</Tag>}
          </Space>
          {r.preview && (
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>{r.preview}</Text>
            </div>
          )}
        </div>
      ),
    },
    {
      title: "Reçu",
      dataIndex: "receivedAt",
      width: 160,
      render: (v: string) => <Text type="secondary">{new Date(v).toLocaleString("fr-FR")}</Text>,
    },
    {
      title: "",
      key: "actions",
      width: 130,
      render: (_: unknown, r: InboxItem) => (
        <Space size={4}>
          {r.direction === "inbound" && (
            <Tooltip title="Re-catégoriser (IA / heuristique)">
              <Button
                size="small"
                icon={<TagsOutlined />}
                onClick={(e) => { e.stopPropagation(); void recategorize(r); }}
              />
            </Tooltip>
          )}
          <Tooltip title={r.isRead ? "Marquer non lu" : "Marquer lu"}>
            <Button size="small" icon={<CheckOutlined />} onClick={(e) => { e.stopPropagation(); void toggleRead(r); }} />
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <div className="page-stack page-stack-between">
        <Space wrap>
          <Title level={3} style={{ margin: 0 }}><MailOutlined /> Boîte de réception</Title>
        </Space>
        <Space wrap>
          <Select
            value={view}
            onChange={(v) => { setView(v); setPage(1); }}
            style={{ width: 180 }}
            options={[
              { value: "replies", label: "Réponses" },
              { value: "unmatched", label: "Non rattachés" },
              { value: "auto", label: "Auto-replies" },
              { value: "all", label: "Tous les entrants" },
            ]}
          />
          <Input.Search
            placeholder="Sujet, contenu…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={() => { setPage(1); void load(); }}
            style={{ width: 240 }}
            allowClear
          />
          <Switch
            checkedChildren="Non lus"
            unCheckedChildren="Tous"
            checked={unreadOnly}
            onChange={(v) => { setUnreadOnly(v); setPage(1); }}
          />
          <Button icon={<ReloadOutlined />} onClick={() => void load()}>Rafraîchir</Button>
        </Space>
      </div>

      <Card size="small" styles={{ body: { padding: 0 } }}>
        <Table
          rowKey="id"
          dataSource={data}
          loading={loading}
          columns={columns}
          size="small"
          locale={{ emptyText: <Empty description="Aucun message" /> }}
          onRow={(record) => ({
            onClick: () => void openItem(record),
            style: { cursor: "pointer", backgroundColor: record.isRead ? undefined : "#f0f8ff" },
          })}
          pagination={{
            current: page,
            pageSize,
            total,
            showSizeChanger: true,
            onChange: (p, ps) => { setPage(p); setPageSize(ps); },
          }}
        />
      </Card>

      <Drawer
        open={!!opened}
        onClose={() => setOpened(null)}
        width={720}
        title={opened?.subject ?? "Message"}
        destroyOnHidden
      >
        {opened && (
          <Space direction="vertical" size="middle" style={{ width: "100%" }}>
            <Space size={8} wrap>
              <Text strong>De :</Text> <Text>{opened.from}</Text>
              {opened.lead && (
                <Link href={`/leads/${opened.lead.id}`}>
                  <Tag color={STATUS_COLORS[opened.lead.status]}>
                    {leadName(opened)} · {STATUS_LABELS[opened.lead.status]}
                  </Tag>
                </Link>
              )}
            </Space>
            <div>
              <Text type="secondary">{new Date(opened.receivedAt).toLocaleString("fr-FR")}</Text>
            </div>

            <Divider style={{ margin: "8px 0" }}>Fil de discussion</Divider>
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
                    <Space size={6}>
                      <Tag color={m.direction === "outbound" ? "blue" : "green"}>
                        {m.direction === "outbound" ? "envoyé" : "reçu"}
                      </Tag>
                      <Text style={{ fontWeight: 500 }}>{m.subject ?? "(sans sujet)"}</Text>
                    </Space>
                  }
                  extra={<Text type="secondary" style={{ fontSize: 12 }}>{new Date(m.receivedAt).toLocaleString("fr-FR")}</Text>}
                >
                  <div style={{ fontSize: 12, color: "#888", marginBottom: 6 }}>
                    {m.direction === "outbound" ? `→ ${m.to}` : `← ${m.from}`}
                  </div>
                  {m.bodyHtml ? (
                    <SafeHtml html={m.bodyHtml} style={{ maxHeight: 360, overflow: "auto" }} />
                  ) : (
                    <Paragraph style={{ whiteSpace: "pre-wrap" }}>{m.bodyText ?? <Text type="secondary">(corps vide)</Text>}</Paragraph>
                  )}
                </Card>
              ))}
            </Space>

            <Divider style={{ margin: "8px 0" }}>Répondre</Divider>
            <Form layout="vertical" form={form} disabled={opened.direction === "outbound"}>
              <Form.Item label="Compte SMTP" name="smtpConfigId" rules={[{ required: true, message: "Sélectionnez un compte SMTP" }]}>
                <Select
                  placeholder="Choisir un compte SMTP"
                  options={smtpOpts.map((o) => ({
                    value: o.id,
                    label: `${o.label}${o.fromEmail ? ` <${o.fromEmail}>` : ""}`,
                  }))}
                />
              </Form.Item>
              <Form.Item label="Sujet" name="subject" rules={[{ required: true, message: "Sujet requis" }]}>
                <Input />
              </Form.Item>
              <Form.Item label="Message" name="bodyHtml" rules={[{ required: true, message: "Corps requis" }]}>
                <Input.TextArea rows={8} placeholder="Tapez votre réponse…" />
              </Form.Item>
              <Button type="primary" icon={<SendOutlined />} loading={sending} onClick={() => void submitReply()}>
                Envoyer la réponse
              </Button>
            </Form>
          </Space>
        )}
      </Drawer>
    </Space>
  );
}
