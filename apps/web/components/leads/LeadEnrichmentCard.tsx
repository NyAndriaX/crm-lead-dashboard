"use client";

/**
 * Bloc Enrichissement sur la fiche lead (E-09).
 *
 * Affiche les données collectées par l'engine d'enrichissement, regroupées
 * par source, avec leur date. Bouton "Enrichir maintenant" + sélecteur des
 * providers à exécuter. LinkedIn (E-04) : liens publiés sur le site de l'entreprise
 * « vérifiés », URL déduites du nom « suggestion non vérifiée ».
 */
import { useState } from "react";
import {
  Card, Button, Space, Tag, Typography, Descriptions, List, Select, message,
  Empty, Tooltip, Divider,
} from "antd";
import {
  ThunderboltOutlined, CheckCircleTwoTone, WarningTwoTone, LinkOutlined,
  GlobalOutlined, LinkedinOutlined, TwitterOutlined, FacebookOutlined,
  InstagramOutlined, MailOutlined, BankOutlined, ReadOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";

const { Text, Link: AntLink } = Typography;

type Provider = "email" | "emailVerify" | "company" | "linkedin" | "news" | "social";

const PROVIDER_LABELS: Record<Provider, string> = {
  email: "Recherche email",
  emailVerify: "Vérification email",
  company: "Firmographie",
  linkedin: "LinkedIn",
  news: "Actualités",
  social: "Réseaux sociaux",
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  } catch {
    return "—";
  }
}

// Le contenu d'enrichment est un Json libre — on type souplement.
type EnrichmentData = {
  email?: { found: string | null; candidates?: string[]; confidence: number; source: string; mxValid: boolean; at: string };
  emailVerify?: { verdict: string; confidenceScore: number; mxFound: boolean; disposable: boolean; roleAccount: boolean; at: string };
  company?: {
    source: string; legalName?: string | null; siren?: string | null; siret?: string | null; nafCode?: string | null; nafLabel?: string | null;
    employees?: number | null; employeesRange?: string | null; revenue?: string | null; foundedYear?: number | null; address?: string | null;
    active?: boolean | null; note?: string; at: string;
  };
  linkedin?: {
    company?: LinkedinLink | null; profileGuess?: LinkedinLink | null; verifiedProfiles?: number;
    profileUrlGuess: string | null; companyUrlGuess: string | null; note: string; at: string;
  };
  siteContacts?: { socials?: Record<string, string | undefined> };
  news?: { items: { title: string; url: string; source: string; date: string | null }[]; source: string; at: string };
  social?: { twitter: string | null; facebook: string | null; instagram: string | null; note: string; at: string };
  aiBrief?: { summary: string; angle: string; score: number; source: "ai" | "fallback"; at: string };
  lastEnrichedAt?: string;
  providersRun?: Provider[];
};

type LinkedinLink = { url: string; status: "verified" | "unverified"; source: "site" | "pattern" };

const COMPANY_SOURCE: Record<string, string> = { pappers: "Pappers", "recherche-entreprises": "Recherche d'entreprises (État)", stub: "aucune source" };

function LinkedinRow({ label, url, verified }: { label: string; url: string; verified: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <AntLink href={url} target="_blank" rel="noreferrer"><LinkOutlined /> {label}</AntLink>
      {verified
        ? <Tooltip title="Lien publié sur le site de l'entreprise"><Tag color="green" style={{ marginInlineEnd: 0 }}>vérifié (trouvé sur le site)</Tag></Tooltip>
        : <Tooltip title="URL déduite du nom, non contrôlée"><Tag color="orange" style={{ marginInlineEnd: 0 }}>suggestion non vérifiée</Tag></Tooltip>}
    </div>
  );
}

const VERDICT_COLOR: Record<string, string> = {
  valid: "success",
  risky: "warning",
  invalid: "error",
  unknown: "default",
};

export function LeadEnrichmentCard({
  leadId,
  enrichment,
  contacts,
  onEnriched,
}: {
  leadId: string;
  enrichment: unknown;
  /** Coordonnées privées déchiffrées par l'API (profils LinkedIn de personnes trouvés sur le site). */
  contacts?: { linkedinProfiles?: string[] } | null;
  onEnriched: () => void;
}) {
  const data = (enrichment ?? {}) as EnrichmentData;
  // Profils de personnes publiés sur le site : contactsEnc, ou ancien format (socials.linkedin = /in/…).
  const legacyProfile = data.siteContacts?.socials?.linkedin;
  const verifiedProfiles = Array.from(new Set([
    ...(contacts?.linkedinProfiles ?? []),
    ...(legacyProfile && /linkedin\.com\/(in|pub)\//i.test(legacyProfile) ? [legacyProfile] : []),
  ]));
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([
    "email", "emailVerify", "company", "linkedin", "news", "social",
  ]);

  const hasData = Boolean(data.lastEnrichedAt);

  async function runEnrich() {
    setLoading(true);
    try {
      const { data: res } = await api.post<{ data: { score?: { before: number; after: number | null } } }>(`/leads/${leadId}/enrich`, { providers });
      const sc = res.data.score;
      message.success(sc && sc.after != null && sc.after !== sc.before
        ? `Enrichissement terminé — score ${sc.before} → ${sc.after}`
        : "Enrichissement terminé — score recalculé");
      onEnriched();
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string } } }).response?.data?.message ?? "Échec de l'enrichissement";
      message.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card
      title={<Space><ThunderboltOutlined style={{ color: "#fbbf24" }} /> Enrichissement</Space>}
      size="small"
      style={{ marginTop: 16 }}
      extra={
        hasData ? (
          <Tooltip title={`Dernier enrichissement : ${fmtDate(data.lastEnrichedAt)}`}>
            <Text type="secondary" style={{ fontSize: 11 }}>{fmtDate(data.lastEnrichedAt)}</Text>
          </Tooltip>
        ) : null
      }
    >
      <Space direction="vertical" size={12} style={{ width: "100%" }}>
        <Select<Provider[]>
          mode="multiple"
          size="small"
          style={{ width: "100%" }}
          value={providers}
          onChange={setProviders}
          options={(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => ({
            value: p,
            label: PROVIDER_LABELS[p],
          }))}
          maxTagCount="responsive"
        />
        <Button
          type="primary"
          icon={<ThunderboltOutlined />}
          loading={loading}
          onClick={runEnrich}
          disabled={providers.length === 0}
          block
        >
          {hasData ? "Ré-enrichir" : "Enrichir maintenant"}
        </Button>

        {!hasData ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Aucune donnée d'enrichissement"
          />
        ) : (
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            {/* A1 (F1) — Brief de qualification IA */}
            {data.aiBrief && (
              <div
                style={{
                  background: "rgba(52,211,153,0.1)",
                  border: "1px solid #b7eb8f",
                  borderRadius: 6,
                  padding: 12,
                }}
              >
                <Space style={{ width: "100%", justifyContent: "space-between" }}>
                  <Text strong>🤖 Qualification IA</Text>
                  <Space size={4}>
                    <Tag color={data.aiBrief.score >= 70 ? "green" : data.aiBrief.score >= 45 ? "blue" : "default"}>
                      potentiel {data.aiBrief.score}
                    </Tag>
                    <Tag color={data.aiBrief.source === "ai" ? "purple" : "default"}>
                      {data.aiBrief.source === "ai" ? "IA" : "heuristique"}
                    </Tag>
                  </Space>
                </Space>
                <div style={{ marginTop: 6 }}>
                  <Text style={{ fontSize: 13 }}>{data.aiBrief.summary}</Text>
                </div>
                <div style={{ marginTop: 6 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <strong>Angle :</strong> {data.aiBrief.angle}
                  </Text>
                </div>
              </div>
            )}

            {/* Email trouvé */}
            {data.email && (
              <div>
                <Text strong><MailOutlined /> Email </Text>
                <Tag>{data.email.source}</Tag>
                <div style={{ marginTop: 4 }}>
                  {data.email.found ? (
                    <Space size={6} wrap>
                      <Text copyable>{data.email.found}</Text>
                      <Tag color={data.email.confidence >= 50 ? "green" : data.email.confidence >= 25 ? "orange" : "default"}>
                        confiance {data.email.confidence}%
                      </Tag>
                      {data.email.mxValid
                        ? <Tag color="green">MX OK</Tag>
                        : <Tag color="red">MX absent</Tag>}
                    </Space>
                  ) : <Text type="secondary">Aucun email déduit</Text>}
                </div>
              </div>
            )}

            {/* Vérification email */}
            {data.emailVerify && (
              <div>
                <Text strong><CheckCircleTwoTone twoToneColor="#34d399" /> Vérification </Text>
                <Tag color={VERDICT_COLOR[data.emailVerify.verdict] ?? "default"}>
                  {data.emailVerify.verdict}
                </Tag>
                <Space size={4} wrap style={{ marginTop: 4 }}>
                  <Tag>score {data.emailVerify.confidenceScore}</Tag>
                  {data.emailVerify.mxFound ? <Tag color="green">MX</Tag> : <Tag color="red">no MX</Tag>}
                  {data.emailVerify.disposable && <Tag color="red">jetable</Tag>}
                  {data.emailVerify.roleAccount && <Tag color="orange">rôle</Tag>}
                </Space>
              </div>
            )}

            {/* Firmographie */}
            {data.company && (
              <div>
                <Text strong><BankOutlined /> Entreprise </Text>
                <Tag>{COMPANY_SOURCE[data.company.source] ?? data.company.source}</Tag>
                {data.company.active === false && <Tag color="red">cessée</Tag>}
                {data.company.source === "stub" ? (
                  <div><Text type="secondary" style={{ fontSize: 11 }}>{data.company.note}</Text></div>
                ) : (
                  <Descriptions size="small" column={1} style={{ marginTop: 4 }}>
                    {data.company.legalName && <Descriptions.Item label="Raison sociale">{data.company.legalName}</Descriptions.Item>}
                    {(data.company.siren ?? data.company.siret) && <Descriptions.Item label="SIREN">{data.company.siren ?? data.company.siret}</Descriptions.Item>}
                    {data.company.nafCode && <Descriptions.Item label="Code NAF">{data.company.nafCode}{data.company.nafLabel ? ` — ${data.company.nafLabel}` : ""}</Descriptions.Item>}
                    {data.company.employeesRange && <Descriptions.Item label="Effectif">{data.company.employeesRange}</Descriptions.Item>}
                    {data.company.foundedYear && <Descriptions.Item label="Création">{data.company.foundedYear}</Descriptions.Item>}
                    {data.company.address && <Descriptions.Item label="Siège">{data.company.address}</Descriptions.Item>}
                  </Descriptions>
                )}
              </div>
            )}

            {/* LinkedIn */}
            {data.linkedin && (() => {
              const li = data.linkedin;
              // Fiches enrichies avant E-04 : seules les URL devinées existent.
              const company = li.company ?? (li.companyUrlGuess ? { url: li.companyUrlGuess, status: "unverified" as const, source: "pattern" as const } : null);
              const guess = verifiedProfiles.length ? null : li.profileGuess ?? (li.profileUrlGuess ? { url: li.profileUrlGuess, status: "unverified" as const, source: "pattern" as const } : null);
              if (!company && !guess && !verifiedProfiles.length) return null;
              return (
                <div data-testid="enrichment-linkedin">
                  <Text strong><LinkedinOutlined style={{ color: "#0a66c2" }} /> LinkedIn </Text>
                  <div style={{ marginTop: 4, display: "grid", gap: 4 }}>
                    {company && <LinkedinRow label="Page entreprise" url={company.url} verified={company.status === "verified"} />}
                    {verifiedProfiles.map((url) => (
                      <LinkedinRow key={url} label={`Profil ${decodeURIComponent(url.split("/").filter(Boolean).pop() ?? "")}`} url={url} verified />
                    ))}
                    {guess && <LinkedinRow label="Profil du contact" url={guess.url} verified={false} />}
                    <Text type="secondary" style={{ fontSize: 10 }}>LinkedIn n&apos;est jamais interrogé : seuls les liens publiés sur le site de l&apos;entreprise sont vérifiés.</Text>
                  </div>
                </div>
              );
            })()}

            {/* Réseaux sociaux */}
            {data.social && (
              <div>
                <Text strong><GlobalOutlined /> Réseaux sociaux </Text>
                <Space size={8} style={{ marginTop: 4 }}>
                  {data.social.twitter && <AntLink href={data.social.twitter} target="_blank"><TwitterOutlined /></AntLink>}
                  {data.social.facebook && <AntLink href={data.social.facebook} target="_blank"><FacebookOutlined /></AntLink>}
                  {data.social.instagram && <AntLink href={data.social.instagram} target="_blank"><InstagramOutlined /></AntLink>}
                </Space>
                <div><Text type="secondary" style={{ fontSize: 10 }}>{data.social.note}</Text></div>
              </div>
            )}

            {/* Actualités */}
            {data.news && data.news.items.length > 0 && (
              <div>
                <Divider style={{ margin: "4px 0" }} />
                <Text strong><ReadOutlined /> Actualités récentes</Text>
                <List
                  size="small"
                  dataSource={data.news.items}
                  renderItem={(it) => (
                    <List.Item style={{ padding: "4px 0" }}>
                      <Space direction="vertical" size={0}>
                        <AntLink href={it.url} target="_blank" style={{ fontSize: 12 }}>{it.title}</AntLink>
                        <Text type="secondary" style={{ fontSize: 10 }}>
                          {it.source}{it.date ? ` · ${new Date(it.date).toLocaleDateString("fr-FR")}` : ""}
                        </Text>
                      </Space>
                    </List.Item>
                  )}
                />
              </div>
            )}
          </Space>
        )}
      </Space>
    </Card>
  );
}
