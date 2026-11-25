"use client";

/**
 * Brouillon de réponse préparé par l'IA (mode « Brouillon » de la réponse automatique) :
 * relecture, modification en texte simple, envoi ou suppression.
 */
import { useState } from "react";
import { Button, Input, Popconfirm, Space, message } from "antd";
import { DeleteOutlined, EditOutlined, EyeOutlined, RobotOutlined, SendOutlined } from "@ant-design/icons";
import SafeHtml from "@/components/SafeHtml";
import { api } from "@/lib/client";

export type AiDraft = { id: string; subject: string | null; bodyHtml: string | null; bodyText?: string | null };

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

/** HTML simple → texte éditable (paragraphes, retours à la ligne, liens « texte (url) »). */
export function htmlToText(html: string): string {
  return html
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (_m, url: string, label: string) => (label.trim() === url ? url : `${label} (${url})`))
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e] ?? e)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Texte → HTML simple (paragraphes, <br/>, liens cliquables), contenu échappé. */
export function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1">$1</a>').replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

export function AiDraftCard({ draft, onDone }: { draft: AiDraft; onDone: () => void }) {
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState(draft.subject ?? "");
  const [text, setText] = useState(() => htmlToText(draft.bodyHtml ?? draft.bodyText ?? ""));
  const [busy, setBusy] = useState<"send" | "delete" | null>(null);

  const send = async () => {
    setBusy("send");
    try {
      await api.post(`/inbox/${draft.id}/draft`, editing ? { subject, bodyHtml: textToHtml(text) } : {});
      message.success("Réponse envoyée");
      onDone();
    } catch (e) {
      message.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Envoi impossible");
    } finally {
      setBusy(null);
    }
  };

  const discard = async () => {
    setBusy("delete");
    try {
      await api.delete(`/inbox/${draft.id}/draft`);
      message.success("Brouillon supprimé");
      onDone();
    } catch (e) {
      message.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Suppression impossible");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      style={{
        borderRadius: 16, padding: "12px 16px", border: "1.5px dashed var(--nb-amber)",
        background: "color-mix(in srgb, var(--nb-amber) 7%, transparent)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, fontWeight: 700, color: "var(--nb-amber)", marginBottom: 8 }}>
        <RobotOutlined /> Brouillon de l&apos;IA — à valider avant envoi
      </div>
      {editing ? (
        <div style={{ display: "grid", gap: 8 }}>
          <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Objet" />
          <Input.TextArea value={text} onChange={(e) => setText(e.target.value)} autoSize={{ minRows: 6, maxRows: 16 }} />
        </div>
      ) : (
        <>
          {draft.subject && <div style={{ fontWeight: 600, fontSize: 13, color: "var(--nb-text-strong)", marginBottom: 6 }}>{draft.subject}</div>}
          {draft.bodyHtml ? (
            <SafeHtml html={draft.bodyHtml} style={{ maxHeight: 320, overflow: "auto", fontSize: 13.5 }} />
          ) : (
            <div style={{ whiteSpace: "pre-wrap", fontSize: 13.5 }}>{draft.bodyText ?? ""}</div>
          )}
        </>
      )}
      <Space wrap style={{ marginTop: 10 }}>
        <Button type="primary" icon={<SendOutlined />} loading={busy === "send"} disabled={busy !== null || (editing && !text.trim())} onClick={() => void send()}>
          Envoyer
        </Button>
        <Button icon={editing ? <EyeOutlined /> : <EditOutlined />} disabled={busy !== null} onClick={() => setEditing((v) => !v)}>
          {editing ? "Aperçu" : "Modifier"}
        </Button>
        <Popconfirm title="Supprimer ce brouillon ?" okText="Supprimer" cancelText="Annuler" onConfirm={() => void discard()}>
          <Button danger icon={<DeleteOutlined />} loading={busy === "delete"} disabled={busy !== null}>Supprimer</Button>
        </Popconfirm>
      </Space>
    </div>
  );
}
