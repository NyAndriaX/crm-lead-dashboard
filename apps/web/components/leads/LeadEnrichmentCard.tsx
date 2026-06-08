"use client";

/**
 * Bloc Enrichissement sur la fiche lead (E-09).
 *
 * Affiche les données collectées par l'engine d'enrichissement, regroupées
 * par source, avec leur date. Bouton "Enrichir maintenant" + sélecteur des
 * providers à exécuter.
 */
import { useState } from "react";
import {
  Card, Button, Space, Tag, Typography, Descriptions, List, Select, message,
  Empty, Tooltip, Divider,
} from "antd";
import {
  ThunderboltOutlined, CheckCircleTwoTone, LinkOutlined,
  GlobalOutlined, LinkedinOutlined, TwitterOutlined, FacebookOutlined,
  InstagramOutlined, MailOutlined, BankOutlined, ReadOutlined,
  EnvironmentOutlined, StarOutlined, SearchOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";

const { Text, Link: AntLink, Paragraph } = Typography;

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

type ScraperMeta = {
  placeId?: string;
  mapsUrl?: string;
  rating?: number;
  reviews?: number;
  emailStatus?: string;
  query?: string;
  scrapedAt?: string;
  source?: string;
};

// Le contenu d'enrichment est un Json libre — on type souplement.
type EnrichmentData = {
  summary?: string;
  summarySource?: string;
  summaryAt?: string;
  scraper?: ScraperMeta;
  email?: { found: string | null; candidates?: string[]; confidence: number; source: string; mxValid: boolean; at: string };
  emailVerify?: { verdict: string; confidenceScore: number; mxFound: boolean; disposable: boolean; roleAccount: boolean; at: string };
  company?: { source: string; legalName?: string | null; siret?: string | null; nafCode?: string | null; employees?: number | null; revenue?: string | null; foundedYear?: number | null; note?: string; at: string };
  linkedin?: { profileUrlGuess: string | null; companyUrlGuess: string | null; note: string; at: string };
  news?: { items: { title: string; url: string; source: string; date: string | null }[]; source: string; at: string };
  social?: { twitter: string | null; facebook: string | null; instagram: string | null; note: string; at: string };
  aiBrief?: { summary: string; angle: string; score: number; source: string; at: string };
  lastEnrichedAt?: string;
  providersRun?: Provider[];
};

const SCRAPER_EMAIL_STATUS: Record<string, { color: string; label: string }> = {
  found: { color: "green", label: "Email trouvé" },
  found_legal: { color: "blue", label: "Email légal" },
  no_email: { color: "default", label: "Sans email" },
  no_website: { color: "orange", label: "Sans site" },
  invalid_email: { color: "red", label: "Email invalide" },
  unreachable: { color: "volcano", label: "Site injoignable" },
};

const VERDICT_COLOR: Record<string, string> = {
  valid: "success",
  risky: "warning",
  invalid: "error",
  unknown: "default",
};

export function LeadEnrichmentCard({
  leadId,
  enrichment,
  onEnriched,
}: {
  leadId: string;
  enrichment: unknown;
  onEnriched: () => void;
}) {
  const data = (enrichment ?? {}) as EnrichmentData;
  const [loading, setLoading] = useState(false);
  const [providers, setProviders] = useState<Provider[]>([
    "email", "emailVerify", "company", "linkedin", "news", "social",
  ]);

  const hasScraperData = Boolean(data.summary || data.scraper);
  const hasEngineData = Boolean(data.lastEnrichedAt);
  const hasData = hasScraperData || hasEngineData || Boolean(
    data.aiBrief || data.email || data.emailVerify || data.company || data.linkedin || data.social || data.news,
  );

  async function runEnrich() {
    setLoading(true);
    try {
      await api.post(`/leads/${leadId}/enrich`, { providers });
      message.success("Enrichissement terminé");
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
      title={<Space><ThunderboltOutlined style={{ color: "#fa8c16" }} /> Enrichissement</Space>}
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
            {/* Synthèse entreprise issue du scraping */}
            {data.summary && (
              <div
                style={{
                  background: "#f9f0ff",
                  border: "1px solid #d3adf7",
                  borderRadius: 8,
                  padding: "12px 14px",
                }}
              >
                <Space style={{ width: "100%", justifyContent: "space-between", marginBottom: 6 }} wrap>
                  <Text strong style={{ color: "#531dab" }}>
                    <SearchOutlined /> Contexte entreprise
                  </Text>
                  <Space size={4} wrap>
                    {data.summarySource === "scraper" && <Tag color="purple">Scraping</Tag>}
                    {data.summaryAt && (
                      <Text type="secondary" style={{ fontSize: 11 }}>{fmtDate(data.summaryAt)}</Text>
                    )}
                  </Space>
                </Space>
                <Paragraph style={{ margin: 0, fontSize: 13, lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                  {data.summary}
                </Paragraph>
              </div>
            )}

            {/* Métadonnées Google Maps */}
            {data.scraper && (
              <div
                style={{
                  background: "#fafafa",
                  border: "1px solid #f0f0f0",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                <Text strong style={{ fontSize: 12 }}>
                  <EnvironmentOutlined /> Google Maps
                </Text>
                <Space size={6} wrap style={{ marginTop: 8 }}>
                  {data.scraper.rating != null && (
                    <Tag icon={<StarOutlined />} color="gold">
                      {data.scraper.rating}{data.scraper.reviews != null ? ` (${data.scraper.reviews} avis)` : ""}
                    </Tag>
                  )}
                  {data.scraper.emailStatus && (
                    <Tag color={SCRAPER_EMAIL_STATUS[data.scraper.emailStatus]?.color ?? "default"}>
                      {SCRAPER_EMAIL_STATUS[data.scraper.emailStatus]?.label ?? data.scraper.emailStatus}
                    </Tag>
                  )}
                  {data.scraper.query && <Tag>{data.scraper.query}</Tag>}
                  {data.scraper.mapsUrl && (
                    <AntLink href={data.scraper.mapsUrl} target="_blank" style={{ fontSize: 12 }}>
                      <LinkOutlined /> Voir sur Maps
                    </AntLink>
                  )}
                </Space>
              </div>
            )}

            {hasScraperData && hasEngineData && <Divider style={{ margin: "4px 0" }} />}

            {/* A1 (F1) — Brief de qualification IA */}
            {data.aiBrief && !data.summary && (
              <div
                style={{
                  background: "#f6ffed",
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
                    <Tag color={data.aiBrief.source === "ai" ? "purple" : data.aiBrief.source === "scraper" ? "geekblue" : "default"}>
                      {data.aiBrief.source === "ai" ? "IA" : data.aiBrief.source === "scraper" ? "Scraping" : "heuristique"}
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
                <Text strong><CheckCircleTwoTone twoToneColor="#52c41a" /> Vérification </Text>
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
                <Tag>{data.company.source}</Tag>
                {data.company.source === "stub" ? (
                  <div><Text type="secondary" style={{ fontSize: 11 }}>{data.company.note}</Text></div>
                ) : (
                  <Descriptions size="small" column={1} style={{ marginTop: 4 }}>
                    {data.company.legalName && <Descriptions.Item label="Raison sociale">{data.company.legalName}</Descriptions.Item>}
                    {data.company.siret && <Descriptions.Item label="SIREN/SIRET">{data.company.siret}</Descriptions.Item>}
                    {data.company.nafCode && <Descriptions.Item label="Code NAF">{data.company.nafCode}</Descriptions.Item>}
                    {data.company.foundedYear && <Descriptions.Item label="Création">{data.company.foundedYear}</Descriptions.Item>}
                  </Descriptions>
                )}
              </div>
            )}

            {/* LinkedIn */}
            {data.linkedin && (data.linkedin.profileUrlGuess || data.linkedin.companyUrlGuess) && (
              <div>
                <Text strong><LinkedinOutlined style={{ color: "#0a66c2" }} /> LinkedIn </Text>
                <div style={{ marginTop: 4 }}>
                  {data.linkedin.profileUrlGuess && (
                    <div><AntLink href={data.linkedin.profileUrlGuess} target="_blank"><LinkOutlined /> Profil (estimé)</AntLink></div>
                  )}
                  {data.linkedin.companyUrlGuess && (
                    <div><AntLink href={data.linkedin.companyUrlGuess} target="_blank"><LinkOutlined /> Entreprise (estimé)</AntLink></div>
                  )}
                  <Text type="secondary" style={{ fontSize: 10 }}>URLs heuristiques non vérifiées</Text>
                </div>
              </div>
            )}

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
