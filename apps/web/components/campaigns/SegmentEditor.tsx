"use client";

/**
 * Création / modification d'un segment en pleine page : critères à gauche, audience en direct à droite.
 * `returnTo` (query) permet de revenir dans l'assistant de campagne avec le segment pré-sélectionné.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Col, Input, Modal, Row, Skeleton, Tooltip, message } from "antd";
import {
  ArrowLeftOutlined, DeleteOutlined, FilterOutlined, MailOutlined, RadarChartOutlined, RocketOutlined, SaveOutlined, SyncOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";
import { palette } from "@/lib/theme";
import { Chip, Panel } from "@/components/ui/Kit";
import { SegmentFilterBuilder } from "./SegmentFilterBuilder";
import { AudiencePreview, useSegmentPreview } from "./AudiencePreview";
import { CAMPAIGN_STATUS } from "./CampaignCard";
import { cleanFilters, type CampaignRow, type SegmentFilters, type SegmentRow } from "./types";

export function SegmentEditor({ segmentId }: { segmentId?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = params.get("returnTo");
  const [modal, modalHolder] = Modal.useModal();
  const [name, setName] = useState("");
  const [filters, setFilters] = useState<SegmentFilters>({});
  const [loaded, setLoaded] = useState(!segmentId);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [usedBy, setUsedBy] = useState<CampaignRow[]>([]);
  const { preview, loading } = useSegmentPreview(loaded ? filters : null);

  useEffect(() => {
    if (!segmentId) return;
    Promise.all([api.get<{ data: SegmentRow }>(`/segments/${segmentId}`), api.get<{ data: CampaignRow[] }>("/campaigns")])
      .then(([s, c]) => {
        setName(s.data.data.name);
        setFilters((s.data.data.filters ?? {}) as SegmentFilters);
        setUsedBy(c.data.data.filter((row) => row.segment?.id === segmentId));
        setLoaded(true);
      })
      .catch(() => message.error("Segment introuvable"));
  }, [segmentId]);

  const update = (next: SegmentFilters) => {
    setFilters(next);
    setDirty(true);
  };

  const backHref = returnTo ?? "/campaigns?tab=segments";
  const activeUse = usedBy.filter((c) => ["SCHEDULED", "SENDING", "PAUSED"].includes(c.status));

  const save = async () => {
    if (!name.trim()) {
      message.warning("Donnez un nom au segment");
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), filters: cleanFilters(filters) };
      if (segmentId) {
        await api.put(`/segments/${segmentId}`, payload);
        message.success("Segment enregistré");
        setDirty(false);
        if (returnTo) router.push(`${returnTo}${returnTo.includes("?") ? "&" : "?"}segment=${segmentId}`);
      } else {
        const { data } = await api.post<{ data: { id: string } }>("/segments", payload);
        message.success("Segment créé");
        router.push(returnTo ? `${returnTo}${returnTo.includes("?") ? "&" : "?"}segment=${data.data.id}` : "/campaigns?tab=segments");
      }
    } catch {
      message.error("Enregistrement impossible");
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    void modal.confirm({
      title: `Supprimer le segment « ${name} » ?`,
      content: "Les leads ne sont pas supprimés : seul le regroupement disparaît.",
      okText: "Supprimer",
      okButtonProps: { danger: true },
      cancelText: "Annuler",
      onOk: async () => {
        try {
          await api.delete(`/segments/${segmentId}`);
          message.success("Segment supprimé");
          router.push("/campaigns?tab=segments");
        } catch {
          message.error("Suppression impossible");
        }
      },
    });
  };

  if (!loaded) return <Panel><Skeleton active paragraph={{ rows: 8 }} /></Panel>;

  return (
    <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1fr)" }}>
      {modalHolder}
      <div className="nb-fade-up" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0, flex: 1 }}>
          <Link href={backHref}>
            <Button shape="circle" icon={<ArrowLeftOutlined />} aria-label="Retour" />
          </Link>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="nb-eyebrow">{segmentId ? "Segment" : "Nouveau segment"} · audience dynamique</div>
            <Input
              variant="borderless"
              value={name}
              onChange={(e) => { setName(e.target.value); setDirty(true); }}
              placeholder="Nommez votre audience — ex. « Agences web Lyon score ≥ 70 »"
              className="nb-display"
              style={{ fontSize: 26, fontWeight: 700, padding: 0, color: "var(--nb-text-strong)" }}
              autoFocus={!segmentId}
              maxLength={120}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {segmentId && (
            <Tooltip title={usedBy.length ? "Utilisé par une campagne : suppression impossible" : undefined}>
              <Button danger icon={<DeleteOutlined />} disabled={usedBy.length > 0} onClick={remove}>Supprimer</Button>
            </Tooltip>
          )}
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()} disabled={!!segmentId && !dirty}>
            {segmentId ? "Enregistrer" : returnTo ? "Créer et revenir à la campagne" : "Créer le segment"}
          </Button>
        </div>
      </div>

      {activeUse.length > 0 && (
        <Alert
          type="info"
          showIcon
          icon={<SyncOutlined />}
          message={`Segment utilisé par ${activeUse.length} campagne(s) active(s)`}
          description="Un segment est dynamique : modifier ses critères change les destinataires des prochains lots d'envoi de ces campagnes."
        />
      )}

      <Row gutter={[20, 20]} align="top">
        <Col xs={24} xl={14}>
          <Panel icon={<FilterOutlined />} title="Critères de ciblage" subtitle="Tous les critères se cumulent (ET). Laissez vide pour ne pas filtrer.">
            <SegmentFilterBuilder value={filters} onChange={update} />
          </Panel>

          {segmentId && (
            <Panel icon={<MailOutlined />} title="Campagnes sur ce segment" subtitle={`${usedBy.length} campagne(s)`} accent={palette.pink} style={{ marginTop: 20 }}>
              {usedBy.length === 0 ? (
                <div style={{ color: "var(--nb-text-3)", fontSize: 13 }}>Aucune campagne n&apos;utilise encore ce segment.</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {usedBy.map((c) => {
                    const st = CAMPAIGN_STATUS[c.status] ?? { label: c.status, color: "#94a0bd" };
                    return (
                      <Link key={c.id} href={`/campaigns/${c.id}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 12, background: "var(--nb-control)", border: "1px solid var(--nb-border)", color: "var(--nb-text-strong)" }}>
                        <span style={{ fontWeight: 600 }}>{c.name}</span>
                        <Chip size="sm" color={st.color} dot>{st.label}</Chip>
                      </Link>
                    );
                  })}
                </div>
              )}
            </Panel>
          )}
        </Col>

        <Col xs={24} xl={10}>
          <div style={{ position: "sticky", top: 96, display: "grid", gap: 16 }}>
            <Panel icon={<RadarChartOutlined />} title="Audience en direct" subtitle="Recalculée à chaque critère modifié" accent={palette.cyan}>
              <AudiencePreview preview={preview} loading={loading} />
            </Panel>
            {segmentId && !returnTo && (
              <Link href={`/campaigns/new?segment=${segmentId}`}>
                <Button block size="large" icon={<RocketOutlined />} disabled={dirty || !preview?.reachable}>
                  Créer une campagne sur ce segment
                </Button>
              </Link>
            )}
          </div>
        </Col>
      </Row>
    </div>
  );
}
