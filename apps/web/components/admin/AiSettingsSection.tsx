"use client";

/**
 * Configuration › Intelligence artificielle : l'administrateur choisit le fournisseur (Claude Skills,
 * OpenAI, DeepSeek, Mistral, Gemini, Ollama, service compatible OpenAI), saisit sa clé (stockée chiffrée),
 * le modèle, puis teste la connexion sur une vraie tâche. Toutes les fonctionnalités IA suivent ce réglage.
 */
import { useEffect, useMemo, useState } from "react";
import { Alert, AutoComplete, Button, Input, Skeleton, Switch, Tooltip, message } from "antd";
import {
  ApiOutlined, CheckCircleFilled, CloudServerOutlined, ExperimentOutlined, KeyOutlined, LockOutlined, RollbackOutlined,
  SaveOutlined, ThunderboltOutlined, WarningFilled,
} from "@ant-design/icons";
import { AI_PROVIDERS, getProvider, type AiProviderId } from "@crm/ai/providers";
import { api } from "@/lib/client";
import { palette } from "@/lib/theme";
import { Chip, Panel } from "@/components/ui/Kit";

type AiConfigView = {
  enabled: boolean;
  provider: AiProviderId;
  model: string | null;
  fastModel: string | null;
  baseUrl: string | null;
  hasApiKey: boolean;
  source: "db" | "env";
  updatedAt: string | null;
};

type TestResult = { ok: boolean; provider: string; model: string | null; ms: number; result: string | null; error: string | null };

const TASKS = [
  { name: "crm-scraping-plan", title: "Plan de mission", where: "Prospection IA → assistant", tier: "Rédaction", fallback: "Saisie manuelle des mots-clés" },
  { name: "crm-lead-analysis", title: "Analyse d'établissement", where: "Scraper — chaque site visité", tier: "Volume", fallback: "Email choisi par heuristique, pas de score" },
  { name: "crm-lead-brief", title: "Brief de qualification", where: "Injection des leads", tier: "Rédaction", fallback: "Brief déterministe" },
  { name: "crm-email-personalize", title: "Personnalisation d'email", where: "Campagnes et relances", tier: "Rédaction", fallback: "Email à variables" },
  { name: "crm-email-variants", title: "Variantes de ton", where: "Éditeur de templates", tier: "Rédaction", fallback: "Fonction indisponible" },
  { name: "crm-reply-categorize", title: "Tri des réponses", where: "Boîte de réception (IMAP)", tier: "Volume", fallback: "Heuristique par mots-clés" },
  { name: "crm-auto-reply", title: "Réponse automatique", where: "Après le tri", tier: "Rédaction", fallback: "Modèle de réponse fixe" },
];

const CATEGORY_LABEL: Record<string, string> = {
  interesse: "Intéressé", pas_interesse: "Pas intéressé", rappel: "Rappel demandé", hors_sujet: "Hors sujet", auto_reply: "Réponse automatique",
};

export function AiSettingsSection() {
  const [view, setView] = useState<AiConfigView | null>(null);
  const [provider, setProvider] = useState<AiProviderId>("claude-skills");
  const [enabled, setEnabled] = useState(true);
  const [model, setModel] = useState("");
  const [fastModel, setFastModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [clearKey, setClearKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);

  const load = (v: AiConfigView) => {
    setView(v);
    setProvider(v.provider);
    setEnabled(v.enabled);
    setModel(v.model ?? "");
    setFastModel(v.fastModel ?? "");
    setBaseUrl(v.baseUrl ?? "");
    setApiKey("");
    setClearKey(false);
  };

  useEffect(() => {
    api.get<{ data: AiConfigView }>("/admin/ai-config").then((r) => load(r.data.data)).catch(() => message.error("Configuration IA illisible"));
  }, []);

  const p = getProvider(provider)!;
  const isSkills = p.kind === "skills";
  const sameProvider = view?.provider === provider;
  const keyStored = sameProvider && view?.hasApiKey && !clearKey;
  const missingKey = p.needsKey && !apiKey.trim() && !keyStored;
  const missingUrl = !isSkills && !(baseUrl.trim() || p.baseUrl);
  const missingModel = !isSkills && !(model.trim() || p.defaultModel);
  const dirty = useMemo(() => {
    if (!view) return false;
    return (
      view.provider !== provider || view.enabled !== enabled || (view.model ?? "") !== model || (view.fastModel ?? "") !== fastModel ||
      (view.baseUrl ?? "") !== baseUrl || apiKey.trim() !== "" || clearKey
    );
  }, [view, provider, enabled, model, fastModel, baseUrl, apiKey, clearKey]);

  const choose = (id: AiProviderId) => {
    setProvider(id);
    setTest(null);
    if (id !== view?.provider) {
      const np = getProvider(id)!;
      setModel(np.defaultModel ?? "");
      setFastModel(np.defaultFastModel ?? "");
      setBaseUrl(np.editableBaseUrl ? np.baseUrl ?? "" : "");
      setApiKey("");
      setClearKey(false);
    } else if (view) {
      load(view);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        enabled, provider,
        model: model.trim() || null, fastModel: fastModel.trim() || null,
        baseUrl: p.editableBaseUrl ? baseUrl.trim() || null : null,
      };
      if (apiKey.trim()) body.apiKey = apiKey.trim();
      else if (clearKey || !sameProvider) body.apiKey = null;
      const r = await api.put<{ data: AiConfigView }>("/admin/ai-config", body);
      load(r.data.data);
      message.success(`Fournisseur d'IA enregistré : ${p.label}`);
    } catch (e) {
      message.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTest(null);
    try {
      const r = await api.post<{ data: TestResult }>("/admin/ai-config/test");
      setTest(r.data.data);
    } catch {
      setTest({ ok: false, provider, model: null, ms: 0, result: null, error: "Requête de test impossible" });
    } finally {
      setTesting(false);
    }
  };

  if (!view) return <Panel><Skeleton active paragraph={{ rows: 8 }} /></Panel>;
  const active = getProvider(view.provider)!;

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div className="nb-glass" style={{ borderRadius: 20, padding: 20, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ width: 46, height: 46, borderRadius: 14, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: palette.violet, background: `${palette.violet}1f` }}>
          <ThunderboltOutlined />
        </span>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span className="nb-display" style={{ fontWeight: 650, fontSize: 16, color: "var(--nb-text-strong)" }}>Fournisseur actif : {active.label}</span>
            <Chip size="sm" color={view.enabled ? palette.green : "#94a0bd"} dot>{view.enabled ? "IA activée" : "IA désactivée"}</Chip>
            {view.source === "env" && <Chip size="sm" color={palette.amber}>Réglage par défaut du serveur</Chip>}
          </div>
          <div style={{ fontSize: 12.5, color: "var(--nb-text-3)", marginTop: 4, lineHeight: 1.6 }}>
            Toutes les fonctionnalités IA (prospection, brief, emails, tri des réponses) utilisent ce fournisseur. Les instructions de chaque tâche
            sont versionnées une seule fois et servent à tous les fournisseurs ; si l&apos;IA est indisponible, chaque fonction bascule sur son repli.
          </div>
        </div>
        <Button icon={<ExperimentOutlined />} loading={testing} disabled={dirty} onClick={() => void runTest()}>
          {dirty ? "Enregistrez pour tester" : "Tester la connexion"}
        </Button>
      </div>

      {test && (
        <Alert
          type={test.ok ? "success" : "error"}
          showIcon
          icon={test.ok ? <CheckCircleFilled /> : <WarningFilled />}
          message={test.ok ? `Connexion réussie en ${(test.ms / 1000).toFixed(1)} s` : "Échec du test"}
          description={
            test.ok
              ? `Réponse de test classée « ${CATEGORY_LABEL[test.result ?? ""] ?? test.result} »${test.model ? ` par le modèle ${test.model}` : ""}.`
              : test.error ?? "Erreur inconnue"
          }
        />
      )}

      <Panel icon={<CloudServerOutlined />} title="Choisir le fournisseur" subtitle="Un seul fournisseur actif à la fois ; changez-le à tout moment">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
          {AI_PROVIDERS.map((opt) => {
            const on = opt.id === provider;
            return (
              <div
                key={opt.id}
                role="button"
                tabIndex={0}
                onClick={() => choose(opt.id)}
                onKeyDown={(e) => { if (e.key === "Enter") choose(opt.id); }}
                className="nb-lift"
                style={{
                  position: "relative", cursor: "pointer", borderRadius: 16, padding: 14, transition: "all .2s",
                  border: `1.5px solid ${on ? palette.violet : "var(--nb-border)"}`, background: on ? `${palette.violet}12` : "var(--nb-control)",
                }}
              >
                {on && <CheckCircleFilled style={{ position: "absolute", top: 12, right: 12, color: palette.violet }} />}
                <div style={{ fontWeight: 650, color: "var(--nb-text-strong)", paddingRight: 20 }}>{opt.label}</div>
                <div style={{ fontSize: 11.5, color: "var(--nb-text-3)", margin: "2px 0 8px" }}>{opt.vendor}</div>
                <div style={{ fontSize: 12.5, color: "var(--nb-text-2)", lineHeight: 1.5 }}>{opt.description}</div>
                {view.provider === opt.id && <div style={{ marginTop: 8 }}><Chip size="sm" color={palette.green}>Actif</Chip></div>}
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel icon={<KeyOutlined />} title={`Réglages — ${p.label}`} accent={palette.violet}>
        <div style={{ display: "grid", gap: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, color: "var(--nb-text-2)" }}>
            <Switch checked={enabled} onChange={setEnabled} /> Activer l&apos;IA dans le CRM
          </label>

          <div style={{ display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--nb-text-2)" }}>{p.keyLabel}{p.needsKey ? "" : " (facultatif)"}</span>
            <Input.Password
              prefix={<LockOutlined />}
              value={apiKey}
              onChange={(e) => { setApiKey(e.target.value); setClearKey(false); }}
              placeholder={keyStored ? "•••••••••••••••• enregistrée — saisir pour remplacer" : isSkills ? "sk-ant-oat01-…" : "Collez la clé ici"}
              autoComplete="off"
            />
            <span style={{ fontSize: 11.5, color: "var(--nb-text-3)" }}>
              {p.keyHint ? `${p.keyHint} ` : ""}Stockée chiffrée (AES-256-GCM), jamais réaffichée.
              {keyStored && (
                <Button type="link" size="small" style={{ padding: "0 4px" }} onClick={() => { setClearKey(true); setApiKey(""); }}>Supprimer la clé</Button>
              )}
            </span>
          </div>

          {isSkills ? (
            <Alert
              type="info"
              showIcon
              message="Aucun modèle à choisir"
              description="Avec Claude, chaque tâche est un skill versionné exécuté par le CLI Claude Code : le choix du modèle fait partie du skill, pas de la configuration."
            />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--nb-text-2)" }}>Modèle de rédaction</span>
                <AutoComplete value={model} onChange={setModel} options={p.models.map((m) => ({ value: m }))} placeholder={p.defaultModel ?? "Nom du modèle"} />
                <span style={{ fontSize: 11.5, color: "var(--nb-text-3)" }}>Briefs, emails personnalisés, plans de mission.</span>
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--nb-text-2)" }}>Modèle rapide (facultatif)</span>
                <AutoComplete value={fastModel} onChange={setFastModel} options={p.models.map((m) => ({ value: m }))} placeholder={p.defaultFastModel ?? "Même modèle"} />
                <span style={{ fontSize: 11.5, color: "var(--nb-text-3)" }}>Tâches en volume : analyse des sites, tri des réponses.</span>
              </div>
              <div style={{ display: "grid", gap: 6, gridColumn: "1 / -1" }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--nb-text-2)" }}>Point d&apos;accès (API Chat Completions)</span>
                <Input
                  prefix={<ApiOutlined />}
                  value={p.editableBaseUrl ? baseUrl : p.baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  disabled={!p.editableBaseUrl}
                  placeholder="https://…/v1"
                />
              </div>
            </div>
          )}

          {(missingKey || missingUrl || missingModel) && enabled && (
            <Alert type="warning" showIcon message={missingKey ? `${p.keyLabel} requise pour ce fournisseur.` : missingUrl ? "Point d'accès requis." : "Modèle requis."} />
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <Button disabled={!dirty || saving} onClick={() => load(view)}>Annuler</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} disabled={!dirty || (enabled && (missingKey || missingUrl || missingModel))} onClick={() => void save()}>
              Enregistrer
            </Button>
          </div>
        </div>
      </Panel>

      <Panel icon={<RollbackOutlined />} title="Tâches IA du CRM" subtitle="Chaque tâche a un repli déterministe si l'IA est indisponible" accent={palette.cyan}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {TASKS.map((t) => (
            <div key={t.name} style={{ borderRadius: 14, padding: 14, border: "1px solid var(--nb-border)", background: "var(--nb-control)", display: "grid", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <span style={{ fontWeight: 650, color: "var(--nb-text-strong)" }}>{t.title}</span>
                <Tooltip title={t.tier === "Volume" ? "Utilise le modèle rapide" : "Utilise le modèle de rédaction"}>
                  <span><Chip size="sm" color={t.tier === "Volume" ? "#94a0bd" : palette.violet}>{t.tier}</Chip></span>
                </Tooltip>
              </div>
              <code style={{ fontSize: 11.5, color: "var(--nb-text-3)" }}>{t.name}</code>
              <span style={{ fontSize: 12, color: "var(--nb-text-2)" }}>{t.where}</span>
              <span style={{ fontSize: 12, color: "var(--nb-text-3)" }}>Repli : {t.fallback}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
