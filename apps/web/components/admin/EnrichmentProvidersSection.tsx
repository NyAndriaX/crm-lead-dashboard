"use client";

/**
 * Configuration › Enrichissement (INT-03) : l'administrateur active les fournisseurs d'enrichissement
 * (Hunter.io, Dropcontact, Pappers, API Recherche d'entreprises) et saisit leurs clés, stockées chiffrées
 * comme celle de l'IA. Sans clé enregistrée, la variable d'environnement du serveur sert de repli.
 */
import { useEffect, useState } from "react";
import { Alert, Button, Input, Skeleton, Switch, message } from "antd";
import { BankOutlined, LinkOutlined, LockOutlined, MailOutlined, SaveOutlined, ThunderboltOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";
import { palette } from "@/lib/theme";
import { Chip, Panel } from "@/components/ui/Kit";
import { ENRICHMENT_PROVIDERS, type EnrichmentProviderDef, type EnrichmentProviderId } from "@/lib/enrichmentProviders";

type ProviderView = {
  id: EnrichmentProviderId;
  enabled: boolean;
  usable: boolean;
  keySource: "db" | "env" | "none";
  updatedAt: string | null;
};

const KEY_SOURCE: Record<ProviderView["keySource"], { label: string; color: string }> = {
  db: { label: "Clé enregistrée", color: palette.green },
  env: { label: "Clé du serveur (variable d'environnement)", color: palette.amber },
  none: { label: "Aucune clé", color: "#94a0bd" },
};

function ProviderCard({ def, view, onSaved }: { def: EnrichmentProviderDef; view: ProviderView; onSaved: (v: ProviderView[]) => void }) {
  const [enabled, setEnabled] = useState(view.enabled);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setEnabled(view.enabled); setApiKey(""); }, [view]);

  const dirty = enabled !== view.enabled || apiKey.trim() !== "";

  const save = async (body: { enabled: boolean; apiKey?: string | null }, okMsg: string) => {
    setSaving(true);
    try {
      const r = await api.put<{ data: ProviderView[] }>("/admin/enrichment-providers", { provider: def.id, ...body });
      onSaved(r.data.data);
      message.success(okMsg);
    } catch (e) {
      message.error((e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const status = !view.enabled
    ? { label: "Désactivé", color: "#94a0bd" }
    : view.usable ? { label: "Actif", color: palette.green } : { label: "Clé manquante", color: palette.amber };

  return (
    <div data-testid={`enrichment-provider-${def.id}`} style={{ borderRadius: 16, padding: 16, border: "1px solid var(--nb-border)", background: "var(--nb-control)", display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
        <span style={{ width: 36, height: 36, borderRadius: 12, display: "inline-flex", alignItems: "center", justifyContent: "center", color: palette.violet, background: `${palette.violet}1f` }}>
          {def.usedFor === "email" ? <MailOutlined /> : <BankOutlined />}
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontWeight: 650, color: "var(--nb-text-strong)" }}>{def.label}</span>
            <Chip size="sm" color={status.color} dot>{status.label}</Chip>
            <Chip size="sm" color="#94a0bd">{def.usedFor === "email" ? "Recherche d'email" : "Données entreprise"}</Chip>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--nb-text-3)", marginTop: 2 }}>{def.vendor}</div>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--nb-text-2)" }}>
          <Switch checked={enabled} onChange={setEnabled} aria-label={`Activer ${def.label}`} /> Activé
        </label>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--nb-text-2)", lineHeight: 1.5 }}>{def.description}</div>

      {def.needsKey ? (
        <div style={{ display: "grid", gap: 6 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--nb-text-2)" }}>Clé d&apos;API</span>
            <Chip size="sm" color={KEY_SOURCE[view.keySource].color}>{KEY_SOURCE[view.keySource].label}</Chip>
          </div>
          <Input.Password
            prefix={<LockOutlined />}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={view.keySource === "db" ? "•••••••••••••••• enregistrée — saisir pour remplacer" : "Collez la clé ici"}
            autoComplete="off"
          />
          <span style={{ fontSize: 11.5, color: "var(--nb-text-3)" }}>
            Stockée chiffrée (AES-256-GCM), jamais réaffichée.{def.envVar ? <> Sans clé enregistrée : variable <code>{def.envVar}</code>.</> : null}
            {view.keySource === "db" && (
              <Button type="link" size="small" style={{ padding: "0 4px" }} loading={saving} onClick={() => void save({ enabled, apiKey: null }, `Clé ${def.label} supprimée`)}>
                Supprimer la clé
              </Button>
            )}
          </span>
        </div>
      ) : (
        <Alert type="success" showIcon message="API publique gratuite : aucune clé nécessaire." />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <a href={def.docsUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12 }}><LinkOutlined /> Documentation</a>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          disabled={!dirty}
          loading={saving}
          onClick={() => void save({ enabled, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}) }, `${def.label} enregistré`)}
        >
          Enregistrer
        </Button>
      </div>
    </div>
  );
}

export function EnrichmentProvidersSection() {
  const [views, setViews] = useState<ProviderView[] | null>(null);

  useEffect(() => {
    api.get<{ data: ProviderView[] }>("/admin/enrichment-providers")
      .then((r) => setViews(r.data.data))
      .catch(() => message.error("Configuration de l'enrichissement illisible"));
  }, []);

  if (!views) return <Panel><Skeleton active paragraph={{ rows: 6 }} /></Panel>;

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <Alert
        type="info"
        showIcon
        icon={<ThunderboltOutlined />}
        message="Ordre d'appel lors d'un enrichissement"
        description="Email : Hunter.io, puis Dropcontact, puis déduction par motifs + vérification MX (gratuit). Entreprise : Pappers, puis l'API publique Recherche d'entreprises. Un fournisseur désactivé ou sans clé est ignoré. LinkedIn n'est jamais interrogé : seuls les liens publiés sur le site de l'entreprise sont repris."
      />
      <Panel icon={<MailOutlined />} title="Fournisseurs d'enrichissement" subtitle="Clés stockées chiffrées ; repli sur les variables d'environnement du serveur">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))", gap: 12 }}>
          {ENRICHMENT_PROVIDERS.map((def) => {
            const v = views.find((x) => x.id === def.id);
            return v ? <ProviderCard key={def.id} def={def} view={v} onSaved={setViews} /> : null;
          })}
        </div>
      </Panel>
    </div>
  );
}
