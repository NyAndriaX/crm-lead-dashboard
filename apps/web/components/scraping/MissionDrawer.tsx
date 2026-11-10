"use client";

import { useEffect, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import {
  Alert, Button, Col, DatePicker, Drawer, Form, Input, InputNumber, Row, Segmented, Select, Slider, Space, Switch, message,
} from "antd";
import { AimOutlined, BulbOutlined, DashboardOutlined, EditOutlined, GlobalOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";
import { palette } from "@/lib/theme";
import { AIBadge } from "@/components/ui/Brand";
import { ProspectorRobot } from "@/components/ui/ProspectorRobot";
import { apiError, type Mission, type SchedulePlan, type ScrapingPlan } from "./types";

type FormValues = {
  name: string;
  brief?: string;
  queries?: string[];
  keywords?: string;
  city?: string;
  country?: string;
  limit: number;
  targetProfile?: string;
  minFitScore?: number;
  useFitFilter: boolean;
  detailed: boolean;
  requireEmail: boolean;
  filter_country: boolean;
  locale: string;
  scheduleMode: SchedulePlan["mode"];
  scheduleRunAt?: Dayjs | null;
  scheduleFrequency?: "daily" | "weekly" | "monthly";
  dailyQuota?: number | null;
  sectorSites?: string[];
  delayMs: number;
  retries: number;
  rotateUserAgent: boolean;
  proxyUrl?: string;
};

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="nb-eyebrow" style={{ display: "flex", alignItems: "center", gap: 8, margin: "22px 0 12px" }}>
      <span style={{ color: palette.cyan }}>{icon}</span>
      {children}
    </div>
  );
}

export function MissionDrawer({
  open,
  editing,
  aiAvailable,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: Mission | null;
  aiAvailable: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm<FormValues>();
  const [mode, setMode] = useState<"ai" | "manual">("ai");
  const [planning, setPlanning] = useState(false);
  const [rationale, setRationale] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRationale(null);
    if (editing) {
      const c = editing.config;
      const plan = c.schedulePlan ?? { mode: "manual" as const };
      setMode(c.queries?.length || c.targetProfile ? "ai" : "manual");
      form.setFieldsValue({
        name: editing.name,
        brief: c.brief ?? undefined,
        queries: c.queries ?? [],
        keywords: c.keywords,
        city: c.location.city ?? undefined,
        country: c.location.country ?? "France",
        limit: c.limit,
        targetProfile: c.targetProfile ?? undefined,
        minFitScore: c.minFitScore ?? 50,
        useFitFilter: c.minFitScore != null,
        detailed: c.detailed ?? true,
        requireEmail: c.requireEmail !== false,
        filter_country: c.filter_country ?? true,
        locale: c.locale ?? "fr-FR",
        scheduleMode: plan.mode,
        scheduleRunAt: plan.runAt ? dayjs(plan.runAt) : null,
        scheduleFrequency: plan.frequency ?? "daily",
        dailyQuota: c.dailyQuota ?? null,
        sectorSites: c.sectorSites ?? [],
        delayMs: c.rate?.delayMs ?? 2000,
        retries: c.rate?.retries ?? 2,
        rotateUserAgent: c.rate?.rotateUserAgent ?? true,
        proxyUrl: c.rate?.proxyUrl ?? undefined,
      });
    } else {
      setMode(aiAvailable ? "ai" : "manual");
      form.resetFields();
      form.setFieldsValue({
        country: "France", limit: 30, minFitScore: 50, useFitFilter: true, detailed: true,
        requireEmail: true, filter_country: true, locale: "fr-FR", scheduleMode: "manual", queries: [],
        sectorSites: [], delayMs: 2000, retries: 2, rotateUserAgent: true,
      });
    }
  }, [open, editing, aiAvailable, form]);

  async function generatePlan() {
    const brief = (form.getFieldValue("brief") as string | undefined)?.trim();
    if (!brief || brief.length < 10) {
      message.warning("Décrivez votre cible en une ou deux phrases.");
      return;
    }
    setPlanning(true);
    try {
      const { data } = await api.post<{ data: ScrapingPlan }>("/scraping/plan", {
        brief,
        country: form.getFieldValue("country") || "France",
        locale: form.getFieldValue("locale") || "fr-FR",
      });
      const p = data.data;
      form.setFieldsValue({
        name: form.getFieldValue("name") || p.name,
        queries: p.queries,
        keywords: p.queries[0],
        targetProfile: p.targetProfile,
        limit: p.suggestedLimit,
        minFitScore: p.minFitScore,
        useFitFilter: true,
      });
      setRationale(p.rationale);
      message.success(`Plan généré : ${p.queries.length} requêtes Google Maps`);
    } catch (e) {
      message.error(apiError(e, "Le plan IA n'a pas pu être généré."));
    } finally {
      setPlanning(false);
    }
  }

  async function submit() {
    const v = await form.validateFields();
    const queries = mode === "ai" ? (v.queries ?? []).map((q) => q.trim()).filter(Boolean) : [];
    const keywords = (mode === "manual" ? v.keywords : v.keywords || queries[0])?.trim();
    if (!keywords) {
      message.warning(mode === "ai" ? "Générez le plan ou ajoutez au moins une requête." : "Les mots-clés sont requis.");
      return;
    }
    const schedulePlan: SchedulePlan =
      v.scheduleMode === "manual"
        ? { mode: "manual" }
        : {
            mode: v.scheduleMode,
            runAt: v.scheduleRunAt ? v.scheduleRunAt.toISOString() : null,
            frequency: v.scheduleMode === "recurring" ? v.scheduleFrequency ?? "daily" : null,
          };
    const body = {
      name: v.name,
      config: {
        keywords,
        brief: mode === "ai" ? v.brief?.trim() || null : null,
        queries,
        targetProfile: v.targetProfile?.trim() || null,
        minFitScore: v.useFitFilter ? v.minFitScore ?? 50 : null,
        location: { city: mode === "manual" ? v.city || null : null, country: v.country || "France", radiusKm: null },
        limit: v.limit,
        detailed: v.detailed,
        locale: v.locale || "fr-FR",
        filter_country: v.filter_country,
        requireEmail: v.requireEmail,
        schedulePlan,
        dailyQuota: v.dailyQuota ?? null,
        sectorSites: (v.sectorSites ?? []).map((u) => u.trim()).filter(Boolean),
        rate: {
          delayMs: v.delayMs ?? 2000,
          retries: v.retries ?? 2,
          rotateUserAgent: v.rotateUserAgent,
          proxyUrl: v.proxyUrl?.trim() || null,
        },
      },
    };
    setSaving(true);
    try {
      if (editing) await api.put(`/scraping/missions/${editing.id}`, body);
      else await api.post("/scraping/missions", body);
      message.success(editing ? "Mission mise à jour" : "Mission créée");
      onSaved();
    } catch (e) {
      message.error(apiError(e, "Enregistrement impossible"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width={720}
      title={
        <Space>
          <span className="nb-display" style={{ fontWeight: 600 }}>{editing ? `Modifier « ${editing.name} »` : "Nouvelle mission de prospection"}</span>
        </Space>
      }
      extra={
        <Space>
          <Button onClick={onClose}>Annuler</Button>
          <Button type="primary" loading={saving} onClick={() => void submit()}>{editing ? "Enregistrer" : "Créer la mission"}</Button>
        </Space>
      }
    >
      <Segmented
        block
        value={mode}
        onChange={(v) => setMode(v as "ai" | "manual")}
        options={[
          { value: "ai", label: <span><ThunderboltOutlined /> Assistant IA</span>, disabled: !aiAvailable },
          { value: "manual", label: <span><EditOutlined /> Manuel</span> },
        ]}
      />
      {!aiAvailable && (
        <Alert style={{ marginTop: 12 }} type="info" showIcon message="Assistant IA indisponible : configurez un fournisseur d'IA dans Configuration › Intelligence artificielle." />
      )}

      <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 18 }}>
        {mode === "ai" && (
          <div
            className="nb-gradient-border"
            style={{ borderRadius: 18, padding: 18, background: "linear-gradient(135deg, rgba(167, 139, 250,0.08), rgba(139,92,246,0.14))", marginBottom: 6 }}
          >
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <div style={{ flexShrink: 0, marginTop: -6 }}>
                <ProspectorRobot state={planning ? "scanning" : rationale ? "success" : "idle"} size={78} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Space style={{ marginBottom: 8 }}>
                  <AIBadge>Briefing IA</AIBadge>
                  <span style={{ color: palette.textSecondary, fontSize: 13 }}>Décrivez votre client idéal, l&apos;IA conçoit la mission.</span>
                </Space>
                <Form.Item name="brief" style={{ marginBottom: 10 }}>
                  <Input.TextArea
                    autoSize={{ minRows: 3, maxRows: 6 }}
                    placeholder="Ex. Agences immobilières indépendantes en Bretagne, plutôt petites (moins de 20 salariés), hors franchises, pour leur proposer notre CRM."
                  />
                </Form.Item>
                <Button type="primary" icon={<BulbOutlined />} loading={planning} onClick={() => void generatePlan()}>
                  {planning ? "L'IA conçoit votre plan…" : "Générer le plan avec l'IA"}
                </Button>
              </div>
            </div>
            {rationale && <Alert style={{ marginTop: 14 }} type="success" showIcon message="Stratégie proposée" description={rationale} />}
          </div>
        )}

        <SectionTitle icon={<AimOutlined />}>Recherche</SectionTitle>
        <Form.Item name="name" label="Nom de la mission" rules={[{ required: true, message: "Requis" }, { max: 100 }]}>
          <Input placeholder="Ex. Agences immo indépendantes Bretagne" />
        </Form.Item>
        {mode === "ai" ? (
          <Form.Item name="queries" label="Requêtes Google Maps" tooltip="Métier + zone, sans le pays. Modifiez ou ajoutez des requêtes (Entrée).">
            <Select mode="tags" placeholder="Générées par l'IA — ou saisissez les vôtres" tokenSeparators={[";"]} maxCount={8} />
          </Form.Item>
        ) : (
          <Row gutter={12}>
            <Col span={14}>
              <Form.Item name="keywords" label="Mots-clés" rules={[{ required: true, message: "Requis" }]}>
                <Input placeholder="Ex. agence immobilière" />
              </Form.Item>
            </Col>
            <Col span={10}>
              <Form.Item name="city" label="Ville (optionnel)"><Input placeholder="Ex. Rennes" /></Form.Item>
            </Col>
          </Row>
        )}
        <Row gutter={12}>
          <Col span={12}><Form.Item name="country" label="Pays"><Input /></Form.Item></Col>
          <Col span={12}>
            <Form.Item name="locale" label="Langue Google Maps">
              <Select options={[{ value: "fr-FR", label: "Français" }, { value: "en-US", label: "English" }, { value: "es-ES", label: "Español" }, { value: "de-DE", label: "Deutsch" }]} />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item name="limit" label="Nombre de fiches à collecter">
          <Slider min={5} max={120} step={5} marks={{ 10: "10", 30: "30", 60: "60", 120: "120" }} />
        </Form.Item>

        <SectionTitle icon={<GlobalOutlined />}>Sites sectoriels (optionnel)</SectionTitle>
        <Form.Item
          name="sectorSites"
          label="Pages d'annuaires professionnels ou de listes de membres"
          tooltip="Collez l'adresse d'une page qui liste des établissements (annuaire de branche, membres d'une fédération…) puis Entrée. Les établissements trouvés suivent le même traitement que ceux de Google Maps : visite du site, analyse IA, dédoublonnage. Le fichier robots.txt de chaque site est respecté."
          rules={[
            {
              validator: async (_r, value?: string[]) => {
                const bad = (value ?? []).find((u) => !/^https?:\/\/[^\s]+\.[^\s]+/i.test(u.trim()));
                if (bad) throw new Error(`Adresse invalide : ${bad}`);
              },
            },
          ]}
        >
          <Select mode="tags" placeholder="https://www.federation-exemple.fr/adherents" tokenSeparators={[" ", ";", ","]} maxCount={10} open={false} suffixIcon={null} />
        </Form.Item>

        <SectionTitle icon={<ThunderboltOutlined />}>Qualification IA</SectionTitle>
        <Form.Item name="targetProfile" label="Profil cible" tooltip="Utilisé par l'IA pour noter chaque établissement de 0 à 100.">
          <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} placeholder="Ex. Agences immobilières indépendantes de 2 à 20 salariés en Bretagne. Exclure les réseaux franchisés." />
        </Form.Item>
        <Row gutter={12} align="middle">
          <Col span={8}>
            <Form.Item name="useFitFilter" label="Écarter hors cible" valuePropName="checked"><Switch /></Form.Item>
          </Col>
          <Col span={16}>
            <Form.Item noStyle shouldUpdate={(p, c) => p.useFitFilter !== c.useFitFilter}>
              {() => (
                <Form.Item name="minFitScore" label="Score d'adéquation minimal">
                  <Slider
                    disabled={!form.getFieldValue("useFitFilter")}
                    min={0} max={100} step={5}
                    marks={{ 0: "0", 40: { label: "40", style: { color: palette.amber } }, 70: { label: "70", style: { color: palette.green } }, 100: "100" }}
                  />
                </Form.Item>
              )}
            </Form.Item>
          </Col>
        </Row>
        <Row gutter={12}>
          <Col span={8}><Form.Item name="detailed" label="Visiter les sites" valuePropName="checked" tooltip="Emails, mentions légales et analyse IA"><Switch /></Form.Item></Col>
          <Col span={8}><Form.Item name="requireEmail" label="Email obligatoire" valuePropName="checked"><Switch /></Form.Item></Col>
          <Col span={8}><Form.Item name="filter_country" label="Filtrer le pays" valuePropName="checked"><Switch /></Form.Item></Col>
        </Row>

        <SectionTitle icon={<EditOutlined />}>Planification</SectionTitle>
        <Row gutter={12}>
          <Col span={8}>
            <Form.Item name="scheduleMode" label="Mode">
              <Select options={[{ value: "manual", label: "Manuel" }, { value: "once", label: "Ponctuelle" }, { value: "recurring", label: "Récurrente" }]} />
            </Form.Item>
          </Col>
          <Form.Item noStyle shouldUpdate={(p, c) => p.scheduleMode !== c.scheduleMode}>
            {() => {
              const sm = form.getFieldValue("scheduleMode");
              if (sm === "manual") return null;
              return (
                <>
                  <Col span={8}>
                    <Form.Item name="scheduleRunAt" label={sm === "once" ? "Date & heure" : "Première exécution"}>
                      <DatePicker showTime format="DD/MM/YYYY HH:mm" style={{ width: "100%" }} />
                    </Form.Item>
                  </Col>
                  {sm === "recurring" && (
                    <Col span={8}>
                      <Form.Item name="scheduleFrequency" label="Fréquence">
                        <Select options={[{ value: "daily", label: "Quotidienne" }, { value: "weekly", label: "Hebdomadaire" }, { value: "monthly", label: "Mensuelle" }]} />
                      </Form.Item>
                    </Col>
                  )}
                </>
              );
            }}
          </Form.Item>
        </Row>
        <Form.Item name="dailyQuota" label="Quota par exécution (optionnel)">
          <InputNumber min={1} max={1000} style={{ width: "100%" }} placeholder="Illimité si vide" />
        </Form.Item>

        <SectionTitle icon={<DashboardOutlined />}>Débit et proxy</SectionTitle>
        <Row gutter={12}>
          <Col xs={24} sm={8}>
            <Form.Item name="delayMs" label="Délai entre deux visites" tooltip="Pause entre deux fiches ou pages visitées.">
              <InputNumber min={0} max={60000} step={500} addonAfter="ms" style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="retries" label="Nouvelles tentatives" tooltip="En cas d'échec de la mission.">
              <InputNumber min={0} max={5} style={{ width: "100%" }} />
            </Form.Item>
          </Col>
          <Col xs={24} sm={8}>
            <Form.Item name="rotateUserAgent" label="Varier le navigateur" valuePropName="checked" tooltip="Un user-agent différent pour chaque site visité.">
              <Switch />
            </Form.Item>
          </Col>
        </Row>
        <Form.Item
          name="proxyUrl"
          label="Proxy (optionnel)"
          tooltip="Sinon, le proxy configuré sur le serveur de scraping s'applique. Les identifiants sont chiffrés et ne sont plus affichés."
          rules={[{ pattern: /^((https?|socks5|socks4):\/\/\S+)?$/i, message: "Format : http://utilisateur:motdepasse@hôte:port" }]}
        >
          <Input allowClear placeholder="http://utilisateur:motdepasse@proxy.exemple.fr:3128" autoComplete="off" />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
