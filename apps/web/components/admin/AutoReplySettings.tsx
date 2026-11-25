"use client";

/**
 * Configuration › Intelligence artificielle › Réponse automatique : quand un prospect répond,
 * l'IA rédige une réponse selon la catégorie (intéressé / à rappeler → proposition de rendez-vous ;
 * pas intéressé → clôture polie). Désactivée, en brouillon à valider, ou envoyée automatiquement.
 */
import { useEffect, useState } from "react";
import { Alert, Button, Input, Radio, Select, Space, message } from "antd";
import { RobotOutlined, SaveOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";
import { palette } from "@/lib/theme";
import { Panel } from "@/components/ui/Kit";

type Mode = "off" | "draft" | "auto";
type Settings = { mode: Mode; meetingUrl: string | null; smtpConfigId: string | null };
type Account = { id: string; label: string; host: string; fromEmail: string | null };

const MODES: { value: Mode; label: string; help: string }[] = [
  { value: "off", label: "Désactivée", help: "Aucune réponse : vous répondez vous-même depuis « Réponses »." },
  { value: "draft", label: "Brouillon à valider (recommandé)", help: "L'IA prépare la réponse et vous prévient ; vous l'envoyez, la modifiez ou la supprimez depuis la conversation." },
  { value: "auto", label: "Envoi automatique", help: "L'IA répond immédiatement, sans validation. À réserver quand vous êtes sûr du ton des réponses." },
];

export function AutoReplySettings() {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [mode, setMode] = useState<Mode>("off");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [smtpConfigId, setSmtpConfigId] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [saving, setSaving] = useState(false);

  const apply = (s: Settings) => {
    setSaved(s);
    setMode(s.mode);
    setMeetingUrl(s.meetingUrl ?? "");
    setSmtpConfigId(s.smtpConfigId);
  };

  useEffect(() => {
    api.get<{ data: Settings }>("/admin/auto-reply").then((r) => apply(r.data.data)).catch(() => message.error("Réglages de réponse automatique illisibles"));
    api.get<{ data: Account[] }>("/smtp-configs?active=true").then((r) => setAccounts(r.data.data)).catch(() => setAccounts([]));
  }, []);

  const urlInvalid = meetingUrl.trim() !== "" && !/^https?:\/\/\S+$/.test(meetingUrl.trim());
  const dirty = !!saved && (saved.mode !== mode || (saved.meetingUrl ?? "") !== meetingUrl.trim() || saved.smtpConfigId !== smtpConfigId);

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.put<{ data: Settings }>("/admin/auto-reply", { mode, meetingUrl: meetingUrl.trim() || null, smtpConfigId });
      apply(r.data.data);
      message.success("Réponse automatique enregistrée");
    } catch (e) {
      message.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel
      icon={<RobotOutlined />}
      title="Réponse automatique par l'IA"
      subtitle="Quand un prospect répond : proposition de rendez-vous s'il est intéressé, clôture polie sinon"
      accent={palette.amber}
    >
      <div style={{ display: "grid", gap: 16 }}>
        <Radio.Group value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
          <Space direction="vertical">
            {MODES.map((m) => (
              <Radio key={m.value} value={m.value}>
                <span style={{ fontWeight: 600 }}>{m.label}</span>
                <div style={{ fontSize: 12, color: "var(--nb-text-3)" }}>{m.help}</div>
              </Radio>
            ))}
          </Space>
        </Radio.Group>

        <div style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Lien de prise de rendez-vous</span>
          <Input
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
            placeholder="https://calendly.com/votre-nom/30min (Calendly, Google Agenda, Cal.com…)"
            status={urlInvalid ? "error" : undefined}
            disabled={mode === "off"}
          />
          <span style={{ fontSize: 12, color: urlInvalid ? "var(--nb-red)" : "var(--nb-text-3)" }}>
            {urlInvalid ? "Lien invalide (doit commencer par https://)." : "Facultatif : sans lien, l'IA demande ses disponibilités au prospect."}
          </span>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <span style={{ fontWeight: 600 }}>Compte d&apos;envoi des réponses</span>
          <Select
            allowClear
            value={smtpConfigId ?? undefined}
            onChange={(v?: string) => setSmtpConfigId(v ?? null)}
            placeholder="Premier compte actif (par défaut)"
            disabled={mode === "off"}
            options={accounts.map((a) => ({
              value: a.id,
              label: `${a.label}${a.fromEmail ? ` — ${a.fromEmail}` : ""}${a.host === "gmail-api" ? " (Gmail API)" : ""}`,
            }))}
          />
          <span style={{ fontSize: 12, color: "var(--nb-text-3)" }}>La signature reprend le nom d&apos;expéditeur de ce compte.</span>
        </div>

        {mode === "auto" && (
          <Alert type="warning" showIcon message="Les réponses partiront sans relecture. Testez d'abord en mode « Brouillon à valider »." />
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button disabled={!dirty || saving} onClick={() => saved && apply(saved)}>Annuler</Button>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!dirty || urlInvalid} onClick={() => void save()}>
            Enregistrer
          </Button>
        </div>
      </div>
    </Panel>
  );
}
