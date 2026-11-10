"use client";

/**
 * Assistant de campagne en pleine page : Audience → Message → Envoi → Lancement.
 * Le brouillon en cours est conservé en sessionStorage quand on part créer un segment,
 * puis restauré au retour (le nouveau segment arrive pré-sélectionné via `?segment=`).
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useMounted } from "@/lib/hooks/useMounted";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert, Button, Col, DatePicker, Input, InputNumber, Row, Segmented, Skeleton, Slider, Switch, Tooltip, message,
} from "antd";
import {
  ArrowLeftOutlined, ArrowRightOutlined, CalendarOutlined, CheckCircleFilled, CloudServerOutlined, ExperimentOutlined,
  FileTextOutlined, FireOutlined, PlusOutlined, RocketOutlined, SaveOutlined, SearchOutlined, TeamOutlined, ThunderboltOutlined,
  WarningFilled,
} from "@ant-design/icons";
import dayjs, { type Dayjs } from "dayjs";
import { api } from "@/lib/client";
import { palette } from "@/lib/theme";
import { AIBadge } from "@/components/ui/Brand";
import { Chip, Panel } from "@/components/ui/Kit";
import { AudiencePreview, useSegmentPreview } from "./AudiencePreview";
import { EmailPreview } from "./EmailPreview";
import { describeFilters } from "./SegmentFilterBuilder";
import type { CampaignConfig, CampaignRow, SegmentRow, SmtpOpt, TemplateOpt } from "./types";

const DRAFT_KEY = "crm-campaign-draft";
const EDITABLE = ["DRAFT", "SCHEDULED", "PAUSED"];

type Draft = {
  name: string;
  segmentId: string | null;
  templateId: string | null;
  subject: string;
  aiPersonalize: boolean;
  bodyHtmlOverride: string;
  abEnabled: boolean;
  subjectB: string;
  bodyHtmlB: string;
  splitPercent: number;
  smtpConfigId: string | null;
  startMode: "now" | "later";
  scheduledAt: string | null;
  dailyLimit: number | null;
  throttleSec: number;
  warmupEnabled: boolean;
  warmupStart: number;
  warmupGrowth: number;
};

const EMPTY: Draft = {
  name: "", segmentId: null, templateId: null, subject: "", aiPersonalize: true, bodyHtmlOverride: "",
  abEnabled: false, subjectB: "", bodyHtmlB: "", splitPercent: 50, smtpConfigId: null, startMode: "now",
  scheduledAt: null, dailyLimit: null, throttleSec: 12, warmupEnabled: false, warmupStart: 40, warmupGrowth: 1.15,
};

const STEPS = [
  { key: "audience", title: "Audience", hint: "Qui reçoit ?", icon: <TeamOutlined /> },
  { key: "message", title: "Message", hint: "Que dit-on ?", icon: <FileTextOutlined /> },
  { key: "delivery", title: "Envoi", hint: "Quand et comment ?", icon: <CloudServerOutlined /> },
  { key: "review", title: "Lancement", hint: "Vérifier et lancer", icon: <RocketOutlined /> },
] as const;

function fromCampaign(c: CampaignRow): Draft {
  const cfg = (c.config ?? {}) as CampaignConfig;
  return {
    name: c.name,
    segmentId: c.segment?.id ?? null,
    templateId: c.template?.id ?? null,
    subject: c.subject ?? "",
    aiPersonalize: Boolean(cfg.aiPersonalize),
    bodyHtmlOverride: cfg.bodyHtmlOverride ?? "",
    abEnabled: Boolean(cfg.ab?.enabled),
    subjectB: cfg.ab?.subjectB ?? "",
    bodyHtmlB: cfg.ab?.bodyHtmlB ?? "",
    splitPercent: cfg.ab?.splitPercent ?? 50,
    smtpConfigId: c.smtpConfig?.id ?? null,
    startMode: c.scheduledAt && dayjs(c.scheduledAt).isAfter(dayjs()) ? "later" : "now",
    scheduledAt: c.scheduledAt,
    dailyLimit: c.dailyLimit,
    throttleSec: Math.round((cfg.throttleMinDelayMs ?? 12_000) / 1000),
    warmupEnabled: Boolean(cfg.warmup?.enabled),
    warmupStart: cfg.warmup?.startPerDay ?? 40,
    warmupGrowth: cfg.warmup?.growth ?? 1.15,
  };
}

/** Plafond d'envoi jour par jour — même règle que le worker (min SMTP, campagne, warm-up). */
function dailyCaps(d: Draft, smtpLimit: number, days: number): number[] {
  const base = Math.min(smtpLimit, d.dailyLimit ?? smtpLimit);
  return Array.from({ length: days }, (_, i) =>
    d.warmupEnabled ? Math.min(base, Math.floor(Math.max(1, d.warmupStart) * d.warmupGrowth ** i)) : base,
  );
}

function SelectCard({ selected, onClick, color = palette.violet, children }: { selected: boolean; onClick: () => void; color?: string; children: ReactNode }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      className="nb-lift"
      style={{
        position: "relative", cursor: "pointer", borderRadius: 16, padding: 16, transition: "all .2s var(--nb-ease)",
        border: `1.5px solid ${selected ? color : "var(--nb-border)"}`,
        background: selected ? `${color}14` : "var(--nb-control)",
        boxShadow: selected ? `0 0 0 3px ${color}22, 0 12px 30px -18px ${color}` : "none",
      }}
    >
      {selected && <CheckCircleFilled style={{ position: "absolute", top: 12, right: 12, color, fontSize: 18 }} />}
      {children}
    </div>
  );
}

function ToggleCard({ icon, title, description, checked, onChange, color, badge, children }: {
  icon: ReactNode; title: string; description: ReactNode; checked: boolean; onChange: (v: boolean) => void; color: string; badge?: ReactNode; children?: ReactNode;
}) {
  return (
    <div style={{ borderRadius: 16, padding: 16, border: `1px solid ${checked ? `${color}66` : "var(--nb-border)"}`, background: checked ? `${color}0f` : "var(--nb-control)", transition: "all .2s" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color, background: `${color}1f`, fontSize: 16 }}>{icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 650, color: "var(--nb-text-strong)" }}>{title}</span>
            {badge}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--nb-text-3)", marginTop: 3, lineHeight: 1.55 }}>{description}</div>
        </div>
        <Switch checked={checked} onChange={onChange} />
      </div>
      {checked && children && <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed var(--nb-border)" }}>{children}</div>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 6 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--nb-text-2)" }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11.5, color: "var(--nb-text-3)" }}>{hint}</span>}
    </label>
  );
}

export function CampaignWizard({ campaignId }: { campaignId?: string }) {
  const router = useRouter();
  const mounted = useMounted();
  const params = useSearchParams();
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(campaignId ? 3 : 0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [status, setStatus] = useState<string>("DRAFT");
  const [segments, setSegments] = useState<SegmentRow[] | null>(null);
  const [templates, setTemplates] = useState<TemplateOpt[]>([]);
  const [smtps, setSmtps] = useState<SmtpOpt[]>([]);
  const [segQuery, setSegQuery] = useState("");
  const [previewLead, setPreviewLead] = useState<string | null>(null);
  const [variant, setVariant] = useState<"A" | "B">("A");
  const [busy, setBusy] = useState<null | "save" | "launch">(null);
  const [ready, setReady] = useState(false);
  // Brouillon mis de côté avant de créer un segment : lu une seule fois, à l'initialisation
  // (les effets peuvent s'exécuter deux fois en développement, la lecture ne doit pas en dépendre).
  const [stashed] = useState<Partial<Draft> | null>(() => {
    try {
      const raw = typeof window !== "undefined" ? sessionStorage.getItem(DRAFT_KEY) : null;
      return raw ? (JSON.parse(raw) as Partial<Draft>) : null;
    } catch {
      return null;
    }
  });

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  useEffect(() => {
    const preSegment = params.get("segment");
    const fromId = params.get("from"); // duplication : l'assistant part d'une campagne existante
    const sourceId = campaignId ?? fromId;
    const loadCampaign = sourceId ? api.get<{ data: CampaignRow }>(`/campaigns/${sourceId}`) : Promise.resolve(null);
    Promise.all([
      api.get<{ data: SegmentRow[] }>("/segments?counts=1"),
      api.get<{ data: TemplateOpt[] }>("/templates"),
      api.get<{ data: SmtpOpt[] }>("/smtp-configs"),
      loadCampaign,
    ])
      .then(([seg, tpl, sm, camp]) => {
        setSegments(seg.data.data);
        setTemplates(tpl.data.data);
        const activeSmtps = sm.data.data.filter((s) => s.isActive !== false);
        setSmtps(activeSmtps);
        let next: Draft = { ...EMPTY, smtpConfigId: activeSmtps[0]?.id ?? null };
        if (camp && campaignId) {
          next = fromCampaign(camp.data.data);
          setStatus(camp.data.data.status);
        } else if (camp) {
          next = { ...fromCampaign(camp.data.data), name: `${camp.data.data.name} (copie)`, startMode: "now", scheduledAt: null };
          setMaxStep(3);
        }
        if (stashed && preSegment) next = { ...next, ...stashed };
        try {
          sessionStorage.removeItem(DRAFT_KEY);
        } catch {
          /* stockage indisponible : rien à nettoyer */
        }
        if (preSegment && seg.data.data.some((s) => s.id === preSegment)) next.segmentId = preSegment;
        setDraft(next);
        setReady(true);
      })
      .catch(() => message.error("Chargement impossible"));
  }, [campaignId, params, stashed]);

  const segment = segments?.find((s) => s.id === draft.segmentId) ?? null;
  const template = templates.find((t) => t.id === draft.templateId) ?? null;
  const smtp = smtps.find((s) => s.id === draft.smtpConfigId) ?? null;
  const { preview, loading: previewLoading } = useSegmentPreview(segment ? (segment.filters ?? {}) : null);
  const editable = EDITABLE.includes(status);
  const reachable = preview?.reachable ?? segment?.reachable ?? 0;

  const caps = useMemo(() => dailyCaps(draft, smtp?.dailyLimit ?? 200, 60), [draft, smtp]);
  const estimate = useMemo(() => {
    if (!reachable) return { days: 0, perDay: caps[0] ?? 0 };
    let left = reachable;
    let days = 0;
    while (left > 0 && days < caps.length) left -= caps[days++] ?? 0;
    return { days: left > 0 ? null : days, perDay: caps[0] ?? 0 };
  }, [reachable, caps]);

  const stepValid = [
    !!draft.segmentId,
    !!draft.templateId && draft.subject.trim().length > 0 && (!draft.abEnabled || draft.subjectB.trim().length > 0 || draft.bodyHtmlB.trim().length > 0),
    !!draft.smtpConfigId && (draft.startMode === "now" || (!!draft.scheduledAt && dayjs(draft.scheduledAt).isAfter(dayjs()))),
    true,
  ];
  const complete = stepValid.slice(0, 3).every(Boolean) && draft.name.trim().length > 0;

  const goTo = (i: number) => {
    if (i > maxStep && !stepValid.slice(0, i).every(Boolean)) return;
    setStep(i);
    setMaxStep((m) => Math.max(m, i));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const pickTemplate = (t: TemplateOpt) => {
    const keepSubject = draft.subject.trim() && draft.subject !== template?.subject;
    set({ templateId: t.id, subject: keepSubject ? draft.subject : t.subject });
  };

  const pickSegment = (s: SegmentRow) => {
    const autoName = !draft.name.trim() || draft.name.startsWith("Campagne — ");
    set({ segmentId: s.id, name: autoName ? `Campagne — ${s.name} · ${dayjs().format("MMM YYYY")}` : draft.name });
  };

  // Retour vers l'assistant après création / ajustement d'un segment : le brouillon est mis de côté.
  const returnTo = encodeURIComponent(campaignId ? `/campaigns/${campaignId}/edit` : "/campaigns/new");
  const stashDraft = () => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* stockage indisponible : le brouillon sera perdu, sans bloquer la navigation */
    }
  };

  const payload = () => {
    const config: CampaignConfig = {
      throttleMinDelayMs: draft.throttleSec * 1000,
      bodyHtmlOverride: draft.bodyHtmlOverride.trim() || undefined,
      aiPersonalize: draft.aiPersonalize,
      ab: draft.abEnabled ? { enabled: true, subjectB: draft.subjectB || undefined, bodyHtmlB: draft.bodyHtmlB || undefined, splitPercent: draft.splitPercent } : undefined,
      warmup: draft.warmupEnabled ? { enabled: true, startPerDay: draft.warmupStart, growth: draft.warmupGrowth } : undefined,
    };
    return {
      name: draft.name.trim(),
      templateId: draft.templateId,
      segmentId: draft.segmentId,
      smtpConfigId: draft.smtpConfigId,
      subject: draft.subject.trim(),
      scheduledAt: draft.startMode === "later" && draft.scheduledAt ? new Date(draft.scheduledAt) : null,
      dailyLimit: draft.dailyLimit ?? null,
      config,
    };
  };

  const submit = async (launch: boolean) => {
    if (!complete) {
      message.warning("Complétez les étapes : nom, segment, template, objet et SMTP.");
      return;
    }
    setBusy(launch ? "launch" : "save");
    try {
      let id = campaignId;
      if (id) await api.put(`/campaigns/${id}`, payload());
      else id = (await api.post<{ data: { id: string } }>("/campaigns", payload())).data.data.id;
      if (launch) {
        if (status === "PAUSED") await api.post(`/campaigns/${id}/resume`, {});
        else if (status === "DRAFT") await api.post(`/campaigns/${id}/schedule`, draft.startMode === "later" && draft.scheduledAt ? { scheduledAt: draft.scheduledAt } : {});
        message.success(draft.startMode === "later" ? "Campagne planifiée" : "Campagne lancée — les envois démarrent");
      } else {
        message.success(campaignId ? "Modifications enregistrées" : "Brouillon enregistré");
      }
      router.push(`/campaigns/${id}`);
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message;
      message.error(msg ?? "Enregistrement impossible");
      setBusy(null);
    }
  };

  if (!ready || !segments) return <Panel><Skeleton active paragraph={{ rows: 10 }} /></Panel>;

  if (campaignId && !editable) {
    return (
      <Panel>
        <Alert
          type="warning"
          showIcon
          message="Cette campagne n'est plus modifiable"
          description="Une campagne en cours d'envoi, terminée ou annulée ne peut plus être modifiée. Mettez-la en pause pour l'ajuster."
          action={<Link href={`/campaigns/${campaignId}`}><Button>Voir la campagne</Button></Link>}
        />
      </Panel>
    );
  }

  const filteredSegments = segments.filter((s) => s.name.toLowerCase().includes(segQuery.trim().toLowerCase()));
  const launchLabel = status === "PAUSED" ? "Reprendre l'envoi" : status === "SCHEDULED" ? "Enregistrer la planification" : draft.startMode === "later" ? "Planifier la campagne" : "Lancer maintenant";
  const sampleLeads = preview?.sample ?? [];
  const html = draft.abEnabled && variant === "B" && draft.bodyHtmlB.trim() ? draft.bodyHtmlB : draft.bodyHtmlOverride.trim() || template?.bodyHtml || "";
  const subjectShown = draft.abEnabled && variant === "B" && draft.subjectB.trim() ? draft.subjectB : draft.subject;

  return (
    <div style={{ display: "grid", gap: 18, paddingBottom: 90, gridTemplateColumns: "minmax(0, 1fr)" }}>
      {/* En-tête : retour + nom éditable */}
      <div className="nb-fade-up" style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Link href={campaignId ? `/campaigns/${campaignId}` : "/campaigns"}>
          <Button shape="circle" icon={<ArrowLeftOutlined />} aria-label="Retour" />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="nb-eyebrow">{campaignId ? "Modifier la campagne" : params.get("from") ? "Nouvelle campagne · copie" : "Nouvelle campagne"}</div>
          <Input
            variant="borderless"
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Nom de la campagne"
            className="nb-display"
            maxLength={150}
            style={{ fontSize: 26, fontWeight: 700, padding: 0, color: "var(--nb-text-strong)" }}
          />
        </div>
        <span className="nb-hide-mobile"><AIBadge>L'IA personnalise chaque email</AIBadge></span>
      </div>

      {/* Stepper */}
      <div className="nb-glass" style={{ borderRadius: 20, padding: 8, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 6 }}>
        {STEPS.map((s, i) => {
          const active = i === step;
          const done = i < step || (i <= maxStep && stepValid[i] && i !== step);
          const reachableStep = i <= maxStep || stepValid.slice(0, i).every(Boolean);
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => goTo(i)}
              disabled={!reachableStep}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 14, border: "none", textAlign: "left",
                cursor: reachableStep ? "pointer" : "not-allowed", opacity: reachableStep ? 1 : 0.45, transition: "all .25s var(--nb-ease)",
                background: active ? palette.gradientSoft : "transparent",
                boxShadow: active ? `inset 0 0 0 1px ${palette.violet}55` : "none",
              }}
            >
              <span
                style={{
                  width: 34, height: 34, borderRadius: 11, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15,
                  color: active || done ? "#fff" : "var(--nb-text-3)",
                  background: done ? palette.green : active ? palette.gradient : "var(--nb-control)",
                  boxShadow: active ? `0 0 18px -4px ${palette.violet}` : "none",
                }}
              >
                {done ? <CheckCircleFilled /> : s.icon}
              </span>
              <span className="nb-stepper-text" style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 650, fontSize: 13.5, color: active ? "var(--nb-text-strong)" : "var(--nb-text-2)" }}>{i + 1}. {s.title}</span>
                <span style={{ display: "block", fontSize: 11.5, color: "var(--nb-text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.hint}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Bandeau récapitulatif, visible à chaque étape */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <Chip color={palette.cyan}><TeamOutlined /> {segment ? `${segment.name} · ${reachable} joignable${reachable > 1 ? "s" : ""}` : "Audience à choisir"}</Chip>
        <Chip color={palette.violet}><FileTextOutlined /> {template?.name ?? "Template à choisir"}</Chip>
        <Chip color={palette.pink}><CloudServerOutlined /> {smtp?.label ?? "SMTP à choisir"}</Chip>
        <Chip color={palette.amber}><CalendarOutlined /> {draft.startMode === "later" && draft.scheduledAt ? dayjs(draft.scheduledAt).format("DD/MM à HH:mm") : "Départ au lancement"}</Chip>
        {draft.aiPersonalize && <Chip color={palette.green}><ThunderboltOutlined /> IA activée</Chip>}
        {draft.abEnabled && <Chip color={palette.blue}><ExperimentOutlined /> A/B {100 - draft.splitPercent}/{draft.splitPercent}</Chip>}
      </div>

      <div key={step} className="nb-fade-up">
        {step === 0 && (
          <Row gutter={[20, 20]} align="top">
            <Col xs={24} xl={14}>
              <Panel
                icon={<TeamOutlined />}
                title="À qui s'adresse cette campagne ?"
                subtitle="Choisissez un segment existant ou créez-en un sur mesure"
                accent={palette.cyan}
                extra={
                  <Input prefix={<SearchOutlined style={{ color: "var(--nb-text-3)" }} />} placeholder="Rechercher" allowClear value={segQuery} onChange={(e) => setSegQuery(e.target.value)} style={{ width: 200 }} />
                }
              >
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12, maxHeight: 560, overflow: "auto", padding: 2 }}>
                  <Link href={`/campaigns/segments/new?returnTo=${returnTo}`} onClick={stashDraft} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 130, borderRadius: 16, border: "1.5px dashed var(--nb-border-strong)", color: "var(--nb-text-2)", fontWeight: 600 }}>
                    <span style={{ width: 40, height: 40, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", background: palette.gradientSoft, color: palette.violet, fontSize: 18 }}><PlusOutlined /></span>
                    Nouveau segment
                    <span style={{ fontSize: 11.5, fontWeight: 400, color: "var(--nb-text-3)" }}>votre saisie est conservée</span>
                  </Link>
                  {filteredSegments.map((s) => {
                    const crit = describeFilters(s.filters);
                    return (
                      <SelectCard key={s.id} selected={draft.segmentId === s.id} onClick={() => pickSegment(s)} color={palette.cyan}>
                        <div style={{ fontWeight: 650, color: "var(--nb-text-strong)", paddingRight: 22 }}>{s.name}</div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6, margin: "8px 0" }}>
                          <span className="nb-display nb-mono" style={{ fontSize: 26, fontWeight: 800, color: palette.cyan }}>{s.reachable ?? "—"}</span>
                          <span style={{ fontSize: 12, color: "var(--nb-text-3)" }}>joignables / {s.leadCount ?? "—"}</span>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                          {crit.length === 0 ? <span style={{ fontSize: 11.5, color: "var(--nb-text-3)" }}>Tous les leads</span> : crit.slice(0, 3).map((c) => <Chip key={c} size="sm" color={palette.violet}>{c}</Chip>)}
                          {crit.length > 3 && <Chip size="sm" color="#94a0bd">+{crit.length - 3}</Chip>}
                        </div>
                      </SelectCard>
                    );
                  })}
                </div>
              </Panel>
            </Col>
            <Col xs={24} xl={10}>
              <div style={{ position: "sticky", top: 96 }}>
                <Panel title="Audience sélectionnée" subtitle={segment?.name ?? "Aucun segment choisi"} accent={palette.cyan}>
                  {segment ? (
                    <>
                      <AudiencePreview preview={preview} loading={previewLoading} />
                      <Link href={`/campaigns/segments/${segment.id}?returnTo=${returnTo}`} onClick={stashDraft}>
                        <Button type="link" style={{ padding: 0, marginTop: 10 }}>Ajuster les critères de ce segment →</Button>
                      </Link>
                    </>
                  ) : (
                    <div style={{ color: "var(--nb-text-3)", fontSize: 13, padding: "30px 0", textAlign: "center" }}>
                      Sélectionnez un segment pour voir combien de prospects seront réellement contactés.
                    </div>
                  )}
                </Panel>
              </div>
            </Col>
          </Row>
        )}

        {step === 1 && (
          <Row gutter={[20, 20]} align="top">
            <Col xs={24} xl={12}>
              <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1fr)" }}>
                <Panel icon={<FileTextOutlined />} title="Template de départ" subtitle="Le gabarit que l'IA adaptera à chaque prospect">
                  <div style={{ display: "grid", gap: 8, maxHeight: 300, overflow: "auto", padding: 2 }}>
                    {templates.length === 0 && (
                      <div style={{ fontSize: 13, color: "var(--nb-text-3)" }}>
                        Aucun template : créez-en un dans <Link href="/settings#emailing">Configuration → Emailing</Link>.
                      </div>
                    )}
                    {templates.map((t) => (
                      <SelectCard key={t.id} selected={draft.templateId === t.id} onClick={() => pickTemplate(t)}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", paddingRight: 24 }}>
                          <span style={{ fontWeight: 650, color: "var(--nb-text-strong)" }}>{t.name}</span>
                          {t.category && <Chip size="sm" color={palette.pink}>{t.category}</Chip>}
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--nb-text-3)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Objet : {t.subject}</div>
                      </SelectCard>
                    ))}
                  </div>
                </Panel>

                <Panel title="Objet de l'email" subtitle="Variables : {{prenom}}, {{nom}}, {{entreprise}}">
                  <Input size="large" value={draft.subject} onChange={(e) => set({ subject: e.target.value })} placeholder="Ex. {{prenom}}, une idée pour {{entreprise}}" maxLength={300} showCount />
                </Panel>

                <ToggleCard
                  icon={<ThunderboltOutlined />}
                  title="Personnalisation par l'IA"
                  badge={<AIBadge>Recommandé</AIBadge>}
                  description="Chaque email est réécrit pour son destinataire (activité, signaux d'achat, décideur). Si l'IA est indisponible, le template à variables est envoyé."
                  checked={draft.aiPersonalize}
                  onChange={(v) => set({ aiPersonalize: v })}
                  color={palette.violet}
                />

                <ToggleCard
                  icon={<ExperimentOutlined />}
                  title="Test A/B"
                  description="Envoyez une variante B à une partie de l'audience pour comparer les taux d'ouverture et de réponse."
                  checked={draft.abEnabled}
                  onChange={(v) => { set({ abEnabled: v }); if (!v) setVariant("A"); }}
                  color={palette.blue}
                >
                  <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
                    <Field label="Objet de la variante B">
                      <Input value={draft.subjectB} onChange={(e) => set({ subjectB: e.target.value })} placeholder="Une autre accroche à tester" />
                    </Field>
                    <Field label={`Répartition : A ${100 - draft.splitPercent} % · B ${draft.splitPercent} %`}>
                      <Slider min={10} max={90} step={5} value={draft.splitPercent} onChange={(v) => set({ splitPercent: v })} />
                    </Field>
                    <Field label="Corps HTML de la variante B (optionnel)" hint="Laissez vide pour ne tester que l'objet.">
                      <Input.TextArea rows={3} value={draft.bodyHtmlB} onChange={(e) => set({ bodyHtmlB: e.target.value })} />
                    </Field>
                  </div>
                </ToggleCard>

                <ToggleCard
                  icon={<FileTextOutlined />}
                  title="Corps spécifique à cette campagne"
                  description="Remplace le corps du template uniquement pour cette campagne (HTML)."
                  checked={draft.bodyHtmlOverride.length > 0}
                  onChange={(v) => set({ bodyHtmlOverride: v ? template?.bodyHtml ?? "<p></p>" : "" })}
                  color={palette.pink}
                >
                  <Input.TextArea rows={6} value={draft.bodyHtmlOverride} onChange={(e) => set({ bodyHtmlOverride: e.target.value })} style={{ fontFamily: "var(--nb-font-mono, monospace)", fontSize: 12.5 }} />
                </ToggleCard>
              </div>
            </Col>
            <Col xs={24} xl={12}>
              <div style={{ position: "sticky", top: 96 }}>
                <Panel title="Aperçu" subtitle="Tel que le prospect le recevra" accent={palette.pink}>
                  <EmailPreview
                    fromName={smtp?.fromName ?? smtp?.label ?? ""}
                    fromEmail={smtp?.fromEmail ?? ""}
                    subject={subjectShown}
                    html={html}
                    leads={sampleLeads}
                    leadId={previewLead}
                    onLead={setPreviewLead}
                    ai={draft.aiPersonalize}
                    variants={draft.abEnabled}
                    variant={variant}
                    onVariant={setVariant}
                  />
                </Panel>
              </div>
            </Col>
          </Row>
        )}

        {step === 2 && (
          <Row gutter={[20, 20]} align="top">
            <Col xs={24} xl={14}>
              <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1fr)" }}>
                <Panel icon={<CloudServerOutlined />} title="Boîte d'envoi" subtitle="Le compte SMTP qui expédie les emails" accent={palette.pink}>
                  {smtps.length === 0 ? (
                    <Alert type="warning" showIcon message="Aucun compte SMTP actif" description={<>Ajoutez-en un dans <Link href="/settings#emailing">Configuration → Emailing</Link>.</>} />
                  ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
                      {smtps.map((s) => (
                        <SelectCard key={s.id} selected={draft.smtpConfigId === s.id} onClick={() => set({ smtpConfigId: s.id })} color={palette.pink}>
                          <div style={{ fontWeight: 650, color: "var(--nb-text-strong)", paddingRight: 22 }}>{s.label}</div>
                          <div style={{ fontSize: 12.5, color: "var(--nb-text-3)", marginTop: 2 }}>{s.fromName ? `${s.fromName} · ` : ""}{s.fromEmail ?? "—"}</div>
                          <div style={{ marginTop: 10 }}><Chip size="sm" color={palette.pink}>{s.dailyLimit ?? 200} envois / jour max</Chip></div>
                        </SelectCard>
                      ))}
                    </div>
                  )}
                </Panel>

                <Panel icon={<CalendarOutlined />} title="Départ" accent={palette.amber}>
                  <div style={{ display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
                    <Segmented
                      block
                      value={draft.startMode}
                      onChange={(v) => set({ startMode: v as Draft["startMode"] })}
                      options={[
                        { value: "now", label: "Dès le lancement" },
                        { value: "later", label: "Planifier une date" },
                      ]}
                    />
                    {draft.startMode === "later" && (
                      <DatePicker
                        showTime={{ format: "HH:mm", minuteStep: 5 }}
                        format="dddd DD MMMM YYYY à HH:mm"
                        size="large"
                        style={{ width: "100%" }}
                        value={draft.scheduledAt ? dayjs(draft.scheduledAt) : null}
                        onChange={(d: Dayjs | null) => set({ scheduledAt: d ? d.toISOString() : null })}
                        disabledDate={(d) => d.isBefore(dayjs().startOf("day"))}
                        placeholder="Choisir la date et l'heure de départ"
                      />
                    )}
                  </div>
                </Panel>

                <Panel icon={<FireOutlined />} title="Rythme et délivrabilité" subtitle="Envoyer progressivement protège la réputation du domaine" accent={palette.green}>
                  <div style={{ display: "grid", gap: 18 }}>
                    <Row gutter={16}>
                      <Col xs={24} md={12}>
                        <Field label="Plafond pour cette campagne (envois / jour)" hint={`Limité de toute façon par le SMTP : ${smtp?.dailyLimit ?? 200} / jour`}>
                          <InputNumber min={1} max={50_000} value={draft.dailyLimit} onChange={(v) => set({ dailyLimit: v ?? null })} placeholder={`${smtp?.dailyLimit ?? 200} (SMTP)`} style={{ width: "100%" }} />
                        </Field>
                      </Col>
                      <Col xs={24} md={12}>
                        <Field label={`Pause entre deux emails : ${draft.throttleSec} s`} hint="Un rythme humain évite les filtres anti-spam.">
                          <Slider min={0} max={120} step={2} value={draft.throttleSec} onChange={(v) => set({ throttleSec: v })} marks={{ 0: "0", 12: "12 s", 60: "1 min", 120: "2 min" }} />
                        </Field>
                      </Col>
                    </Row>
                    <ToggleCard
                      icon={<FireOutlined />}
                      title="Montée en charge (warm-up)"
                      description="Pour un domaine récent : commence petit puis augmente chaque jour."
                      checked={draft.warmupEnabled}
                      onChange={(v) => set({ warmupEnabled: v })}
                      color={palette.amber}
                    >
                      <Row gutter={16}>
                        <Col span={12}><Field label="Départ (emails / jour)"><InputNumber min={1} value={draft.warmupStart} onChange={(v) => set({ warmupStart: v ?? 40 })} style={{ width: "100%" }} /></Field></Col>
                        <Col span={12}><Field label="Croissance quotidienne"><InputNumber min={1} max={3} step={0.05} value={draft.warmupGrowth} onChange={(v) => set({ warmupGrowth: v ?? 1.15 })} style={{ width: "100%" }} formatter={(v) => `× ${v}`} parser={(v) => Number(String(v).replace(/[^\d.]/g, ""))} /></Field></Col>
                      </Row>
                    </ToggleCard>
                  </div>
                </Panel>
              </div>
            </Col>
            <Col xs={24} xl={10}>
              <div style={{ position: "sticky", top: 96 }}>
                <Panel title="Projection d'envoi" subtitle="Emails expédiés par jour selon vos réglages" accent={palette.green}>
                  <ProjectionChart caps={caps.slice(0, 21)} reachable={reachable} />
                  <div style={{ marginTop: 16, fontSize: 13, color: "var(--nb-text-2)", lineHeight: 1.6 }}>
                    {reachable === 0 ? (
                      "Aucun destinataire joignable dans ce segment."
                    ) : estimate.days === null ? (
                      <>Plus de 60 jours nécessaires pour <b>{reachable}</b> destinataires : augmentez le plafond.</>
                    ) : (
                      <><b style={{ color: "var(--nb-text-strong)" }}>{reachable}</b> destinataires envoyés en <b style={{ color: palette.green }}>{estimate.days} jour{estimate.days > 1 ? "s" : ""}</b> (jusqu&apos;à {estimate.perDay} le 1er jour).</>
                    )}
                  </div>
                </Panel>
              </div>
            </Col>
          </Row>
        )}

        {step === 3 && (
          <Row gutter={[20, 20]} align="top">
            <Col xs={24} xl={14}>
              <Panel icon={<CheckCircleFilled />} title="Vérification avant lancement" accent={palette.green}>
                <div style={{ display: "grid", gap: 10 }}>
                  {[
                    { ok: draft.name.trim().length > 0, label: "Nom de campagne", detail: draft.name || "à renseigner en haut de page", step: 0 },
                    { ok: reachable > 0, warn: !!segment && reachable === 0, label: "Audience", detail: segment ? `${segment.name} — ${reachable} destinataire(s) joignable(s)` : "aucun segment", step: 0 },
                    { ok: !!template, label: "Template", detail: template?.name ?? "aucun", step: 1 },
                    { ok: draft.subject.trim().length > 0, label: "Objet", detail: draft.subject || "vide", step: 1 },
                    { ok: true, label: "Personnalisation IA", detail: draft.aiPersonalize ? "l'IA réécrit chaque email" : "désactivée — template à variables", step: 1 },
                    { ok: !!smtp, label: "Boîte d'envoi", detail: smtp ? `${smtp.label} (${smtp.fromEmail ?? "—"})` : "aucune", step: 2 },
                    { ok: stepValid[2], label: "Départ", detail: draft.startMode === "later" ? (draft.scheduledAt ? dayjs(draft.scheduledAt).format("dddd DD MMMM à HH:mm") : "date à choisir") : "dès le lancement", step: 2 },
                    { ok: true, label: "Conformité", detail: "lien de désinscription en un clic, blacklist et bounces exclus automatiquement", step: 3 },
                  ].map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => c.step !== 3 && goTo(c.step)}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 14, border: "1px solid var(--nb-border)", background: "var(--nb-control)", textAlign: "left", cursor: c.step !== 3 ? "pointer" : "default" }}
                    >
                      {c.ok ? <CheckCircleFilled style={{ color: palette.green, fontSize: 18 }} /> : <WarningFilled style={{ color: palette.amber, fontSize: 18 }} />}
                      <span style={{ fontWeight: 600, color: "var(--nb-text-strong)", minWidth: 150 }}>{c.label}</span>
                      <span style={{ color: "var(--nb-text-2)", fontSize: 13, flex: 1 }}>{c.detail}</span>
                      {c.step !== 3 && <span style={{ fontSize: 12, color: "var(--nb-text-3)" }}>Modifier</span>}
                    </button>
                  ))}
                </div>
              </Panel>
            </Col>
            <Col xs={24} xl={10}>
              <div className="nb-glass nb-gradient-border" style={{ borderRadius: 22, padding: 24, display: "grid", gap: 16, position: "sticky", top: 96 }}>
                <div className="nb-eyebrow">Prêt à partir</div>
                <div className="nb-display" style={{ fontSize: 44, fontWeight: 800, lineHeight: 1 }}>
                  <span className="nb-gradient-text">{reachable}</span>
                  <span style={{ fontSize: 16, color: "var(--nb-text-3)", fontWeight: 500 }}> emails personnalisés</span>
                </div>
                <div style={{ color: "var(--nb-text-2)", fontSize: 13.5, lineHeight: 1.6 }}>
                  {estimate.days ? <>Envoi étalé sur <b>{estimate.days} jour(s)</b>, {draft.throttleSec} s entre deux emails. </> : null}
                  Les leads qui répondent sont classés automatiquement dans <b>Réponses</b>.
                </div>
                <Button type="primary" size="large" icon={<RocketOutlined />} loading={busy === "launch"} disabled={!complete || reachable === 0 || busy !== null} onClick={() => void submit(true)} block>
                  {launchLabel}
                </Button>
                <Button size="large" icon={<SaveOutlined />} loading={busy === "save"} disabled={!complete || busy !== null} onClick={() => void submit(false)} block>
                  {campaignId ? "Enregistrer sans lancer" : "Enregistrer en brouillon"}
                </Button>
              </div>
            </Col>
          </Row>
        )}
      </div>

      {/* Barre de navigation fixe — rendue dans <body> : l'animation d'entrée du conteneur
          applique un transform qui casserait position: fixed. */}
      {mounted && createPortal(
      <div
        className="nb-glass"
        style={{
          position: "fixed", bottom: 16, left: "50%", transform: "translateX(-50%)", zIndex: 20, borderRadius: 18, padding: "10px 12px",
          display: "flex", alignItems: "center", gap: 10, boxShadow: "0 20px 50px -20px rgba(0,0,0,0.55)", width: "min(720px, calc(100vw - 32px))",
        }}
      >
        <Button icon={<ArrowLeftOutlined />} disabled={step === 0} onClick={() => goTo(step - 1)}>Précédent</Button>
        <div style={{ flex: 1, display: "flex", justifyContent: "center", gap: 6 }}>
          {STEPS.map((s, i) => (
            <span key={s.key} style={{ width: i === step ? 26 : 8, height: 8, borderRadius: 8, transition: "all .3s var(--nb-ease)", background: i === step ? palette.gradient : i < step ? palette.green : "var(--nb-border-strong)" }} />
          ))}
        </div>
        {step > 0 && step < 3 && (
          <Tooltip title={complete ? undefined : "Nom, segment, template, objet et SMTP sont requis"}>
            <Button icon={<SaveOutlined />} disabled={!complete || busy !== null} loading={busy === "save"} onClick={() => void submit(false)}>Brouillon</Button>
          </Tooltip>
        )}
        {step < 3 && (
          <Button type="primary" disabled={!stepValid[step]} onClick={() => goTo(step + 1)}>
            Suivant <ArrowRightOutlined />
          </Button>
        )}
      </div>,
        document.body,
      )}
    </div>
  );
}

function ProjectionChart({ caps, reachable }: { caps: number[]; reachable: number }) {
  let left = reachable;
  const all = caps.map((cap) => {
    const sent = Math.max(0, Math.min(cap, left));
    left -= sent;
    return { cap, sent };
  });
  // On montre les jours utiles (+1) sur 7 jours minimum, et l'échelle suit les volumes réellement envoyés.
  const lastDay = all.findIndex((b) => b.sent === 0);
  const bars = all.slice(0, Math.max(7, Math.min(caps.length, (lastDay === -1 ? caps.length : lastDay) + 1)));
  const max = Math.max(...bars.map((b) => b.sent), 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 150 }}>
      {bars.map((b, i) => (
        <Tooltip key={i} title={`Jour ${i + 1} : ${b.sent} email(s) · plafond ${b.cap}`}>
          <div style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 4 }}>
            <span className="nb-mono" style={{ fontSize: 10.5, color: b.sent ? "var(--nb-text-2)" : "var(--nb-text-3)" }}>{b.sent || ""}</span>
            <div
              style={{
                width: "100%", height: `${b.sent ? Math.max(6, (b.sent / max) * 100) : 3}%`, borderRadius: 6,
                background: b.sent ? `linear-gradient(180deg, ${palette.green}, ${palette.cyan})` : "var(--nb-border-strong)",
                boxShadow: b.sent ? `0 0 14px -4px ${palette.green}` : "none",
                transformOrigin: "bottom", animation: `nb-grow 0.8s var(--nb-ease) ${i * 0.04}s both`,
              }}
            />
            <span style={{ fontSize: 10, color: "var(--nb-text-3)" }}>J{i + 1}</span>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}
