"use client";

/**
 * Constructeur de séquence pleine page : le parcours se lit de haut en bas
 * (inscription → email → attente → relance … → fin), l'étape sélectionnée est prévisualisée à droite.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMounted } from "@/lib/hooks/useMounted";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Col, Input, InputNumber, Row, Select, Skeleton, Switch, Tooltip, message } from "antd";
import {
  ArrowDownOutlined, ArrowLeftOutlined, ArrowUpOutlined, ClockCircleOutlined, CopyOutlined, DeleteOutlined, FlagOutlined,
  MailOutlined, PlusOutlined, SaveOutlined, StopOutlined, ThunderboltOutlined, UserAddOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";
import { palette } from "@/lib/theme";
import { AIBadge } from "@/components/ui/Brand";
import { Chip, Panel } from "@/components/ui/Kit";
import { EmailPreview } from "@/components/campaigns/EmailPreview";
import type { PreviewLead, SegmentPreview, TemplateOpt } from "@/components/campaigns/types";
import { stepDays, type SequenceRow, type Step } from "./types";

const NEW_STEP: Step = { delayDays: 3, templateId: null, subject: null, bodyHtml: null, stopOnReply: true, aiPersonalize: true };

function Node({ icon, color, children }: { icon: React.ReactNode; color: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span style={{ width: 38, height: 38, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", background: color, boxShadow: `0 0 18px -4px ${color}`, flexShrink: 0 }}>{icon}</span>
      <div style={{ fontWeight: 600, color: "var(--nb-text-strong)" }}>{children}</div>
    </div>
  );
}

function Connector({ children }: { children?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, minHeight: 44, paddingLeft: 18 }}>
      <span aria-hidden style={{ width: 2, alignSelf: "stretch", background: `linear-gradient(${palette.violet}, ${palette.cyan})`, opacity: 0.5, borderRadius: 2 }} />
      {children}
    </div>
  );
}

export function SequenceBuilder({ sequenceId }: { sequenceId?: string }) {
  const router = useRouter();
  const mounted = useMounted();
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<Step[]>([{ ...NEW_STEP, delayDays: 0 }]);
  const [maxSteps, setMaxSteps] = useState<number | null>(null);
  const [selected, setSelected] = useState(0);
  const [templates, setTemplates] = useState<TemplateOpt[]>([]);
  const [sample, setSample] = useState<PreviewLead[]>([]);
  const [previewLead, setPreviewLead] = useState<string | null>(null);
  const [smtp, setSmtp] = useState<{ label: string; fromName?: string | null; fromEmail?: string | null } | null>(null);
  const [ready, setReady] = useState(!sequenceId);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<{ data: TemplateOpt[] }>("/templates").then((r) => setTemplates(r.data.data)).catch(() => {});
    api.post<{ data: SegmentPreview }>("/segments/preview", { filters: {} }).then((r) => setSample(r.data.data.sample)).catch(() => {});
    api.get<{ data: { label: string; fromName?: string | null; fromEmail?: string | null; isActive?: boolean }[] }>("/smtp-configs")
      .then((r) => setSmtp(r.data.data.find((s) => s.isActive !== false) ?? null))
      .catch(() => {});
    if (!sequenceId) return;
    api
      .get<{ data: SequenceRow }>(`/sequences/${sequenceId}`)
      .then((r) => {
        setName(r.data.data.name);
        setSteps(r.data.data.steps?.length ? r.data.data.steps : [{ ...NEW_STEP, delayDays: 0 }]);
        setMaxSteps(r.data.data.maxSteps);
        setReady(true);
      })
      .catch(() => message.error("Séquence introuvable"));
  }, [sequenceId]);

  const days = useMemo(() => stepDays(steps), [steps]);
  const tplOf = (s: Step) => templates.find((t) => t.id === s.templateId) ?? null;
  const stepValid = (s: Step) => !!s.templateId || (!!s.subject?.trim() && !!s.bodyHtml?.trim());
  const invalid = steps.map((s, i) => (stepValid(s) ? -1 : i)).filter((i) => i >= 0);
  const canSave = name.trim().length > 0 && invalid.length === 0;

  const update = (i: number, patch: Partial<Step>) => setSteps((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const insert = (at: number, step: Step = NEW_STEP) => {
    setSteps((list) => [...list.slice(0, at), { ...step }, ...list.slice(at)]);
    setSelected(at);
  };
  const remove = (i: number) => {
    setSteps((list) => list.filter((_, j) => j !== i));
    setSelected((cur) => Math.max(0, cur >= i ? cur - 1 : cur));
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    setSteps((list) => {
      const next = [...list];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
    setSelected(j);
  };

  const save = async () => {
    if (!canSave) {
      message.warning(invalid.length ? `Étape ${invalid[0]! + 1} : choisissez un template ou rédigez objet et corps.` : "Donnez un nom à la séquence.");
      return;
    }
    setSaving(true);
    const body = {
      name: name.trim(),
      maxSteps: maxSteps && maxSteps < steps.length ? maxSteps : null,
      steps: steps.map((s) => ({
        delayDays: Number(s.delayDays ?? 0),
        templateId: s.templateId || null,
        subject: s.subject?.trim() || null,
        bodyHtml: s.bodyHtml?.trim() || null,
        stopOnReply: s.stopOnReply !== false,
        aiPersonalize: Boolean(s.aiPersonalize),
      })),
    };
    try {
      if (sequenceId) {
        await api.put(`/sequences/${sequenceId}`, body);
        message.success("Séquence enregistrée");
        router.push(`/sequences/${sequenceId}`);
      } else {
        const { data } = await api.post<{ data: { id: string } }>("/sequences", body);
        message.success("Séquence créée — inscrivez maintenant des leads");
        router.push(`/sequences/${data.data.id}`);
      }
    } catch (e: unknown) {
      message.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Enregistrement impossible");
      setSaving(false);
    }
  };

  if (!ready) return <Panel><Skeleton active paragraph={{ rows: 10 }} /></Panel>;

  const cur = steps[selected] ?? steps[0]!;
  const curTpl = tplOf(cur);
  const total = days[days.length - 1] ?? 0;

  return (
    <div style={{ display: "grid", gap: 18, paddingBottom: 90, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div className="nb-fade-up" style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Link href={sequenceId ? `/sequences/${sequenceId}` : "/sequences"}><Button shape="circle" icon={<ArrowLeftOutlined />} aria-label="Retour" /></Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="nb-eyebrow">{sequenceId ? "Modifier la séquence" : "Nouvelle séquence de relance"}</div>
          <Input
            variant="borderless"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom de la séquence — ex. « Relance 3 étapes · prospects froids »"
            className="nb-display"
            maxLength={200}
            autoFocus={!sequenceId}
            style={{ fontSize: 26, fontWeight: 700, padding: 0, color: "var(--nb-text-strong)" }}
          />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Chip color={palette.violet}><MailOutlined /> {steps.length} email{steps.length > 1 ? "s" : ""}</Chip>
          <Chip color={palette.cyan}><ClockCircleOutlined /> sur {total} jour{total > 1 ? "s" : ""}</Chip>
          {steps.some((s) => s.aiPersonalize) && <AIBadge>{steps.filter((s) => s.aiPersonalize).length} réécrit(s) par l'IA</AIBadge>}
        </div>
      </div>

      <Row gutter={[20, 20]} align="top">
        <Col xs={24} xl={13}>
          <Panel title="Parcours du prospect" subtitle="Cliquez une étape pour la prévisualiser. Le lead sort dès qu'il répond (si l'option est active).">
            <Node icon={<UserAddOutlined />} color={palette.blue}>Inscription du lead <span style={{ fontWeight: 400, color: "var(--nb-text-3)", fontSize: 12.5 }}>— manuelle ou par segment</span></Node>
            {steps.map((s, i) => {
              const active = i === selected;
              const tpl = tplOf(s);
              const ok = stepValid(s);
              return (
                <div key={i}>
                  <Connector>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--nb-text-2)" }}>
                      <ClockCircleOutlined style={{ color: palette.cyan }} />
                      {i === 0 ? "Envoyer" : "Attendre"}
                      <InputNumber size="small" min={0} max={365} value={s.delayDays} onChange={(v) => update(i, { delayDays: v ?? 0 })} style={{ width: 70 }} />
                      jour{s.delayDays > 1 ? "s" : ""}{i === 0 ? " après l'inscription" : ""}
                      {i === 0 && s.delayDays === 0 && <Chip size="sm" color={palette.green}>immédiat</Chip>}
                    </span>
                  </Connector>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelected(i)}
                    onKeyDown={(e) => { if (e.key === "Enter") setSelected(i); }}
                    style={{
                      borderRadius: 18, padding: 16, cursor: "pointer", transition: "all .2s var(--nb-ease)",
                      border: `1.5px solid ${!ok ? `${palette.amber}99` : active ? palette.violet : "var(--nb-border)"}`,
                      background: active ? `${palette.violet}12` : "var(--nb-control)",
                      boxShadow: active ? `0 0 0 3px ${palette.violet}22` : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                      <span style={{ width: 34, height: 34, borderRadius: 11, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", background: `linear-gradient(135deg, ${i === 0 ? palette.violet : palette.indigo}, ${palette.cyan})` }}><MailOutlined /></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 650, color: "var(--nb-text-strong)" }}>{i === 0 ? "Premier email" : `Relance ${i}`}</div>
                        <div className="nb-mono" style={{ fontSize: 11.5, color: "var(--nb-text-3)" }}>J+{days[i]}</div>
                      </div>
                      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 2 }}>
                        <Tooltip title="Monter"><Button size="small" type="text" icon={<ArrowUpOutlined />} disabled={i === 0} onClick={() => move(i, -1)} /></Tooltip>
                        <Tooltip title="Descendre"><Button size="small" type="text" icon={<ArrowDownOutlined />} disabled={i === steps.length - 1} onClick={() => move(i, 1)} /></Tooltip>
                        <Tooltip title="Dupliquer"><Button size="small" type="text" icon={<CopyOutlined />} onClick={() => insert(i + 1, { ...s, delayDays: 3 })} /></Tooltip>
                        <Tooltip title="Supprimer"><Button size="small" type="text" danger icon={<DeleteOutlined />} disabled={steps.length === 1} onClick={() => remove(i)} /></Tooltip>
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 10 }} onClick={(e) => e.stopPropagation()}>
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        placeholder="Choisir un template (ou rédiger un message libre)"
                        value={s.templateId ?? undefined}
                        onChange={(v) => { update(i, { templateId: v ?? null }); setSelected(i); }}
                        options={templates.map((t) => ({ value: t.id, label: t.name }))}
                        status={ok ? undefined : "warning"}
                      />
                      <Input
                        value={s.subject ?? ""}
                        onChange={(e) => update(i, { subject: e.target.value })}
                        onFocus={() => setSelected(i)}
                        placeholder={tpl ? `Objet du template : ${tpl.subject}` : "Objet (obligatoire sans template)"}
                      />
                      {(!s.templateId || s.bodyHtml) && (
                        <Input.TextArea
                          rows={3}
                          value={s.bodyHtml ?? ""}
                          onChange={(e) => update(i, { bodyHtml: e.target.value })}
                          onFocus={() => setSelected(i)}
                          placeholder="<p>Bonjour {{prenom}}, je reviens vers vous au sujet de {{entreprise}}…</p>"
                          style={{ fontFamily: "monospace", fontSize: 12.5 }}
                        />
                      )}
                      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", fontSize: 12.5, color: "var(--nb-text-2)" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <Switch size="small" checked={!!s.aiPersonalize} onChange={(v) => update(i, { aiPersonalize: v })} />
                          <ThunderboltOutlined style={{ color: palette.violet }} /> Réécrit par l'IA
                        </label>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <Switch size="small" checked={s.stopOnReply !== false} onChange={(v) => update(i, { stopOnReply: v })} />
                          <StopOutlined style={{ color: palette.green }} /> Arrêter si le prospect a répondu
                        </label>
                        {s.templateId && !s.bodyHtml && (
                          <Button size="small" type="link" style={{ padding: 0 }} onClick={() => update(i, { bodyHtml: tpl?.bodyHtml ?? "<p></p>" })}>Personnaliser le corps</Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
            <Connector>
              <Button type="dashed" icon={<PlusOutlined />} onClick={() => insert(steps.length)} disabled={steps.length >= 20}>Ajouter une relance</Button>
            </Connector>
            <Node icon={<FlagOutlined />} color={palette.green}>
              Fin du parcours <span style={{ fontWeight: 400, color: "var(--nb-text-3)", fontSize: 12.5 }}>— J+{total}, le lead sort de la séquence</span>
            </Node>
          </Panel>
        </Col>

        <Col xs={24} xl={11}>
          <div style={{ position: "sticky", top: 96, display: "grid", gap: 16 }}>
            <Panel title={`Aperçu · ${selected === 0 ? "premier email" : `relance ${selected}`}`} subtitle={`Envoyé à J+${days[selected] ?? 0}`} accent={palette.pink}>
              <EmailPreview
                fromName={smtp?.fromName ?? smtp?.label ?? ""}
                fromEmail={smtp?.fromEmail ?? ""}
                subject={cur.subject?.trim() || curTpl?.subject || ""}
                html={cur.bodyHtml?.trim() || curTpl?.bodyHtml || ""}
                leads={sample}
                leadId={previewLead}
                onLead={setPreviewLead}
                ai={!!cur.aiPersonalize}
              />
            </Panel>
          </div>
        </Col>
      </Row>

      {mounted && createPortal(
        <div
          className="nb-glass"
          style={{
            position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 20, borderRadius: 18, padding: "10px 12px",
            display: "flex", alignItems: "center", gap: 10, boxShadow: "0 20px 50px -20px rgba(0,0,0,0.55)", width: "min(640px, calc(100vw - 32px))",
          }}
        >
          <span style={{ flex: 1, fontSize: 13, color: invalid.length ? palette.amber : "var(--nb-text-2)" }}>
            {invalid.length ? `Étape ${invalid[0]! + 1} incomplète : template ou objet + corps requis` : `${steps.length} email(s) sur ${total} jour(s) — prêt à enregistrer`}
          </span>
          <Link href={sequenceId ? `/sequences/${sequenceId}` : "/sequences"}><Button>Annuler</Button></Link>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!canSave} onClick={() => void save()}>
            {sequenceId ? "Enregistrer" : "Créer la séquence"}
          </Button>
        </div>,
        document.body,
      )}
    </div>
  );
}
