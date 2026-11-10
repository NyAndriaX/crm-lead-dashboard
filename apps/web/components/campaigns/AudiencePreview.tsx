"use client";

/** Aperçu en direct d'une audience : volume joignable, exclusions, répartition par statut, échantillon. */
import { useEffect, useRef, useState } from "react";
import { Skeleton, Tooltip } from "antd";
import { CheckCircleFilled, MailOutlined, StopOutlined, TeamOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";
import { palette, statusColors } from "@/lib/theme";
import { STATUS_LABELS } from "@/lib/leadStatus";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { ScoreRing, SegmentBar } from "@/components/ui/Kit";
import { cleanFilters, type SegmentFilters, type SegmentPreview } from "./types";

/** Recalcule l'aperçu (débounce 350 ms) à chaque changement de critères. */
export function useSegmentPreview(filters: SegmentFilters | null) {
  const [preview, setPreview] = useState<SegmentPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const key = filters ? JSON.stringify(cleanFilters(filters)) : null;

  useEffect(() => {
    if (key === null) {
      setPreview(null);
      return;
    }
    const id = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .post<{ data: SegmentPreview }>("/segments/preview", { filters: JSON.parse(key) })
        .then((r) => { if (id === seq.current) setPreview(r.data.data); })
        .catch(() => { if (id === seq.current) setPreview(null); })
        .finally(() => { if (id === seq.current) setLoading(false); });
    }, 350);
    return () => clearTimeout(t);
  }, [key]);

  return { preview, loading };
}

export function AudiencePreview({ preview, loading, compact = false }: { preview: SegmentPreview | null; loading: boolean; compact?: boolean }) {
  if (!preview) return <Skeleton active paragraph={{ rows: compact ? 2 : 6 }} />;
  const excluded = preview.noEmail + preview.blacklisted;
  const statuses = Object.entries(preview.byStatus).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ display: "grid", gap: 18, opacity: loading ? 0.55 : 1, transition: "opacity .25s" }}>
      <div>
        <div className="nb-eyebrow">Destinataires joignables</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span className="nb-display nb-gradient-text" style={{ fontSize: compact ? 38 : 52, fontWeight: 800, lineHeight: 1.05 }}>
            <AnimatedNumber value={preview.reachable} />
          </span>
          <span style={{ color: "var(--nb-text-3)", fontSize: 13 }}>
            sur <b style={{ color: "var(--nb-text-strong)" }}>{preview.total}</b> lead{preview.total > 1 ? "s" : ""} ciblé{preview.total > 1 ? "s" : ""}
          </span>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <SegmentBar
          height={10}
          parts={[
            { value: preview.reachable, color: palette.green },
            { value: preview.noEmail, color: "#94a0bd" },
            { value: preview.blacklisted, color: palette.red },
          ]}
        />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, fontSize: 12, color: "var(--nb-text-2)" }}>
          <span><CheckCircleFilled style={{ color: palette.green }} /> {preview.reachable} joignables</span>
          <Tooltip title="Leads sans adresse email : ils ne recevront rien.">
            <span><MailOutlined style={{ color: "#94a0bd" }} /> {preview.noEmail} sans email</span>
          </Tooltip>
          <Tooltip title="Désinscrits, bounces durs ou ajout manuel à la blacklist : exclus automatiquement.">
            <span><StopOutlined style={{ color: palette.red }} /> {preview.blacklisted} en blacklist</span>
          </Tooltip>
        </div>
        {excluded > 0 && !compact && (
          <div style={{ fontSize: 12, color: "var(--nb-text-3)" }}>Les {excluded} lead(s) exclus sont ignorés à l&apos;envoi, sans action de votre part.</div>
        )}
      </div>

      {!compact && statuses.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          <div className="nb-eyebrow">Répartition par étape</div>
          <SegmentBar parts={statuses.map(([s, n]) => ({ value: n, color: statusColors[s] ?? palette.violet }))} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, fontSize: 12, color: "var(--nb-text-2)" }}>
            {statuses.map(([s, n]) => (
              <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: 3, background: statusColors[s] ?? palette.violet }} />
                {STATUS_LABELS[s as keyof typeof STATUS_LABELS] ?? s} <b className="nb-mono">{n}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {!compact && (
        <div style={{ display: "grid", gap: 8 }}>
          <div className="nb-eyebrow"><TeamOutlined /> Échantillon — meilleurs scores</div>
          {preview.sample.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--nb-text-3)", padding: "18px 0", textAlign: "center" }}>Aucun lead ne correspond à ces critères.</div>
          ) : (
            <div style={{ display: "grid", gap: 6 }} className="nb-stagger">
              {preview.sample.map((l) => (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 12, background: "var(--nb-control)", border: "1px solid var(--nb-border)" }}>
                  <ScoreRing score={l.score} size={34} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: "var(--nb-text-strong)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {[l.firstName, l.lastName].filter(Boolean).join(" ") || "—"} <span style={{ color: "var(--nb-text-3)", fontWeight: 400 }}>· {l.company ?? "—"}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--nb-text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {[l.sector, l.city].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: statusColors[l.status] ?? palette.violet }}>
                    {STATUS_LABELS[l.status as keyof typeof STATUS_LABELS] ?? l.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
