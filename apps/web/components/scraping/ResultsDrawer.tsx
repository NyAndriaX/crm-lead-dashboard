"use client";

import { useMemo, useState } from "react";
import { Button, Drawer, Input, Popconfirm, Progress, Result, Segmented, Space, Table, Tag, Tooltip, message } from "antd";
import type { ColumnsType } from "antd/es/table";
import {
  CheckOutlined, CloseOutlined, CloudUploadOutlined, GlobalOutlined, EnvironmentOutlined, StarFilled,
  ThunderboltOutlined, UserOutlined, SearchOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";
import { palette } from "@/lib/theme";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { apiError, EMAIL_STATUS, fitColor, type BufferItem, type Mission } from "./types";

type Filter = "all" | "pending" | "target" | "rejected";
type InjectResult = { injected: number; skippedDuplicate: number; skippedInvalid: number };

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="nb-glass" style={{ borderRadius: 14, padding: "12px 16px", flex: "1 1 140px" }}>
      <div className="nb-eyebrow" style={{ fontSize: 10 }}>{label}</div>
      <AnimatedNumber value={value} className="nb-display nb-mono" style={{ fontSize: 24, fontWeight: 700, color }} />
    </div>
  );
}

function ScoreRing({ score }: { score: number | null | undefined }) {
  if (score == null) return <span style={{ color: palette.textTertiary, fontSize: 12 }}>—</span>;
  const c = fitColor(score);
  return (
    <Progress
      type="circle"
      size={44}
      percent={score}
      strokeColor={c}
      trailColor="rgba(148,163,184,0.12)"
      strokeWidth={9}
      format={() => <span className="nb-mono" style={{ color: c, fontWeight: 700, fontSize: 13 }}>{score}</span>}
    />
  );
}

export function ResultsDrawer({
  mission,
  items,
  loading,
  onClose,
  onChanged,
}: {
  mission: Mission | null;
  items: BufferItem[];
  loading: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [injecting, setInjecting] = useState(false);
  const [injectResult, setInjectResult] = useState<InjectResult | null>(null);

  const scored = items.filter((i) => i.raw.ai);
  const avgScore = scored.length ? Math.round(scored.reduce((s, i) => s + (i.raw.ai?.fit_score ?? 0), 0) / scored.length) : 0;
  const withDM = items.filter((i) => i.raw.name).length;
  const counts = {
    pending: items.filter((i) => i.status === "pending").length,
    accepted: items.filter((i) => i.status === "accepted").length,
    rejected: items.filter((i) => i.status === "rejected").length,
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => {
        if (filter === "pending" && i.status !== "pending") return false;
        if (filter === "rejected" && i.status !== "rejected") return false;
        if (filter === "target" && (i.raw.ai?.fit_score ?? -1) < 70) return false;
        if (!q) return true;
        return [i.raw.company, i.raw.name, i.raw.email, i.raw.city, i.raw.ai?.activity].some((v) => v?.toLowerCase().includes(q));
      })
      .sort((a, b) => (b.raw.ai?.fit_score ?? -1) - (a.raw.ai?.fit_score ?? -1));
  }, [items, filter, search]);

  async function review(ids: string[], status: "accepted" | "rejected") {
    if (!mission || ids.length === 0) return;
    try {
      await api.patch(`/scraping/missions/${mission.id}/results`, { ids, status });
      message.success(`${ids.length} lead(s) ${status === "accepted" ? "accepté(s)" : "rejeté(s)"}`);
      setSelected([]);
      onChanged();
    } catch (e) {
      message.error(apiError(e, "Action impossible"));
    }
  }

  async function inject() {
    if (!mission) return;
    setInjecting(true);
    try {
      const { data } = await api.post<{ data: InjectResult }>(`/scraping/missions/${mission.id}/results`);
      setInjectResult(data.data);
      onChanged();
    } catch (e) {
      message.error(apiError(e, "Injection impossible"));
    } finally {
      setInjecting(false);
    }
  }

  const acceptTargets = () =>
    review(items.filter((i) => i.status === "pending" && !i.raw.duplicate && (i.raw.ai?.fit_score ?? -1) >= 70).map((i) => i.id), "accepted");

  const columns: ColumnsType<BufferItem> = [
    { title: "Score IA", key: "score", width: 86, render: (_, r) => <ScoreRing score={r.raw.ai?.fit_score} /> },
    {
      title: "Entreprise",
      key: "company",
      render: (_, r) => (
        <div style={{ minWidth: 0 }}>
          <div style={{ color: "var(--nb-text-strong)", fontWeight: 600 }}>{r.raw.company || "—"}</div>
          <div style={{ color: palette.textTertiary, fontSize: 12 }}>{r.raw.ai?.activity || r.raw.sector || "—"}</div>
          <Space size={10} style={{ marginTop: 4, fontSize: 12 }}>
            {r.raw.city && <span style={{ color: palette.textSecondary }}><EnvironmentOutlined /> {r.raw.city}</span>}
            {r.raw.rating != null && <span style={{ color: palette.amber }}><StarFilled /> {r.raw.rating}{r.raw.reviews != null ? ` (${r.raw.reviews})` : ""}</span>}
            {r.raw.website && <a href={r.raw.website} target="_blank" rel="noreferrer"><GlobalOutlined /> Site</a>}
            {r.raw.maps_url && <a href={r.raw.maps_url} target="_blank" rel="noreferrer">Maps</a>}
          </Space>
        </div>
      ),
    },
    {
      title: "Décideur",
      key: "dm",
      width: 190,
      render: (_, r) =>
        r.raw.name ? (
          <Space size={10}>
            <div style={{ width: 32, height: 32, borderRadius: 10, background: palette.gradientSoft, display: "flex", alignItems: "center", justifyContent: "center", color: palette.cyan }}>
              <UserOutlined />
            </div>
            <div style={{ lineHeight: 1.3 }}>
              <div style={{ color: "var(--nb-text-strong)", fontWeight: 600, fontSize: 13 }}>{r.raw.name}</div>
              <div style={{ color: palette.textTertiary, fontSize: 12 }}>{r.raw.contact_role || "Dirigeant"}</div>
            </div>
          </Space>
        ) : (
          <span style={{ color: palette.textTertiary, fontSize: 12 }}>Non identifié</span>
        ),
    },
    {
      title: "Contact",
      key: "contact",
      width: 220,
      render: (_, r) => {
        const st = r.raw.email_status ? EMAIL_STATUS[r.raw.email_status] : null;
        return (
          <div style={{ display: "grid", gap: 4 }}>
            {r.raw.email ? <span style={{ fontSize: 12, color: "var(--nb-text-strong)" }}>{r.raw.email}</span> : <span style={{ fontSize: 12, color: palette.textTertiary }}>—</span>}
            {r.raw.phone && <span style={{ fontSize: 12, color: palette.textSecondary }}>{r.raw.phone}</span>}
            {(() => {
              const c = r.raw.contacts;
              const others = (c?.phones ?? []).length - (r.raw.phone ? 1 : 0);
              const nets = Object.keys(c?.socials ?? {});
              const bits = [
                others > 0 ? `+${others} tél.` : null,
                r.raw.ai?.decision_maker_email || r.raw.ai?.decision_maker_phone ? "ligne directe décideur" : null,
                nets.length ? nets.join(", ") : null,
                c?.legal?.siren ? `SIREN ${c.legal.siren}` : null,
              ].filter(Boolean);
              return bits.length ? <span style={{ fontSize: 11.5, color: palette.textTertiary }}>{bits.join(" · ")}</span> : null;
            })()}
            {st && <Tag color={st.color} style={{ width: "fit-content" }}>{st.label}</Tag>}
          </div>
        );
      },
    },
    {
      title: "Signaux",
      key: "signals",
      width: 210,
      render: (_, r) => {
        const sig = r.raw.ai?.signals ?? [];
        if (sig.length === 0) return <span style={{ color: palette.textTertiary, fontSize: 12 }}>—</span>;
        return (
          <Tooltip title={<ul style={{ margin: 0, paddingLeft: 16 }}>{sig.map((s) => <li key={s}>{s}</li>)}</ul>}>
            <Space size={4} wrap>
              {sig.slice(0, 2).map((s) => (
                <Tag key={s} color="purple" style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{s}</Tag>
              ))}
              {sig.length > 2 && <Tag>+{sig.length - 2}</Tag>}
            </Space>
          </Tooltip>
        );
      },
    },
    {
      title: "Statut",
      key: "status",
      width: 120,
      render: (_, r) => {
        if (r.raw.duplicate) return <Tooltip title={r.raw.duplicateReason}><Tag color="orange">Doublon</Tag></Tooltip>;
        if (r.status === "accepted") return <Tag color="green" icon={<CheckOutlined />}>{r.raw.injectedLeadId ? "Injecté" : "Accepté"}</Tag>;
        if (r.status === "rejected") return <Tooltip title={r.raw.rejectReason}><Tag color="red">{r.raw.rejectReason ? "Hors cible" : "Rejeté"}</Tag></Tooltip>;
        return <Tag color="gold">À valider</Tag>;
      },
    },
  ];

  return (
    <Drawer
      open={!!mission}
      onClose={() => { setInjectResult(null); setSelected([]); onClose(); }}
      width={1200}
      title={<span className="nb-display" style={{ fontWeight: 600 }}>Résultats — {mission?.name}</span>}
      extra={
        <Popconfirm
          title="Injecter les leads acceptés dans le CRM ?"
          description="Un dédoublonnage est refait avant l'insertion. Le brief IA de chaque lead est généré automatiquement."
          okText="Injecter"
          onConfirm={() => void inject()}
        >
          <Button type="primary" icon={<CloudUploadOutlined />} loading={injecting} disabled={counts.accepted === 0}>
            Injecter dans le CRM ({counts.accepted})
          </Button>
        </Popconfirm>
      }
    >
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }} className="nb-stagger">
        <MiniStat label="À valider" value={counts.pending} color={palette.amber} />
        <MiniStat label="Acceptés" value={counts.accepted} color={palette.green} />
        <MiniStat label="Rejetés / hors cible" value={counts.rejected} color={palette.red} />
        <MiniStat label="Score IA moyen" value={avgScore} color={fitColor(scored.length ? avgScore : null)} />
        <MiniStat label="Décideurs identifiés" value={withDM} color={palette.cyan} />
      </div>

      {injectResult && (
        <div className="nb-glass nb-fade-up" style={{ borderRadius: 18, marginBottom: 16, borderColor: "rgba(52,211,153,0.4)" }}>
          <Result
            status="success"
            title={<span className="nb-display">{injectResult.injected} lead(s) ajouté(s) au CRM</span>}
            subTitle={`${injectResult.skippedDuplicate} doublon(s) ignoré(s) · ${injectResult.skippedInvalid} invalide(s). Enrichissement et brief IA générés (50 premiers leads).`}
          />
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <Segmented
          value={filter}
          onChange={(v) => setFilter(v as Filter)}
          options={[
            { value: "all", label: `Tous (${items.length})` },
            { value: "pending", label: `À valider (${counts.pending})` },
            { value: "target", label: <span><ThunderboltOutlined /> Cible ≥ 70</span> },
            { value: "rejected", label: `Rejetés (${counts.rejected})` },
          ]}
        />
        <Input prefix={<SearchOutlined />} allowClear placeholder="Filtrer…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: 220 }} />
        <div style={{ flex: 1 }} />
        <Button icon={<ThunderboltOutlined />} onClick={() => void acceptTargets()}>Accepter les leads cible</Button>
        <Button icon={<CheckOutlined />} disabled={!selected.length} onClick={() => void review(selected, "accepted")}>Accepter ({selected.length})</Button>
        <Button danger icon={<CloseOutlined />} disabled={!selected.length} onClick={() => void review(selected, "rejected")}>Rejeter ({selected.length})</Button>
      </div>

      <Table
        rowKey="id"
        size="middle"
        loading={loading}
        columns={columns}
        dataSource={visible}
        scroll={{ x: 1050 }}
        pagination={{ pageSize: 20, showSizeChanger: false, showTotal: (t) => `${t} lead(s)` }}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (k) => setSelected(k as string[]),
          getCheckboxProps: (r) => ({ disabled: r.raw.duplicate === true }),
        }}
        expandable={{
          rowExpandable: (r) => !!(r.raw.ai || r.raw.enrichment || r.raw.address),
          expandedRowRender: (r) => (
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,2fr) minmax(0,1fr)", gap: 24, padding: "6px 8px" }}>
              <div>
                <div className="nb-eyebrow" style={{ marginBottom: 6 }}>Analyse IA</div>
                <div style={{ color: palette.text, lineHeight: 1.65 }}>{r.raw.ai?.summary || r.raw.enrichment || "—"}</div>
                {r.raw.ai?.fit_reason && (
                  <div style={{ marginTop: 10, color: fitColor(r.raw.ai.fit_score), fontSize: 13 }}>
                    <ThunderboltOutlined /> {r.raw.ai.fit_reason}
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
                {!!r.raw.ai?.services?.length && (
                  <div>
                    <div className="nb-eyebrow" style={{ marginBottom: 6 }}>Services</div>
                    <Space size={4} wrap>{r.raw.ai.services.map((s) => <Tag key={s} color="cyan">{s}</Tag>)}</Space>
                  </div>
                )}
                {!!r.raw.ai?.signals?.length && (
                  <div>
                    <div className="nb-eyebrow" style={{ marginBottom: 6 }}>Signaux d'achat</div>
                    <Space size={4} wrap>{r.raw.ai.signals.map((s) => <Tag key={s} color="purple">{s}</Tag>)}</Space>
                  </div>
                )}
                {r.raw.address && <div style={{ color: palette.textSecondary, fontSize: 12 }}><EnvironmentOutlined /> {r.raw.address}</div>}
              </div>
            </div>
          ),
        }}
      />
    </Drawer>
  );
}
