"use client";

/** Aperçu « client mail » d'un email de campagne, variables de fusion remplacées par un vrai lead. */
import { Segmented, Select } from "antd";
import { UserOutlined } from "@ant-design/icons";
import SafeHtml from "@/components/SafeHtml";
import { palette } from "@/lib/theme";
import { AIBadge } from "@/components/ui/Brand";
import { personalizePreview, type PreviewLead } from "./types";

export function EmailPreview({
  fromName,
  fromEmail,
  subject,
  html,
  leads,
  leadId,
  onLead,
  ai,
  variants,
  variant,
  onVariant,
}: {
  fromName: string;
  fromEmail: string;
  subject: string;
  html: string;
  leads: PreviewLead[];
  leadId: string | null;
  onLead: (id: string) => void;
  ai: boolean;
  variants?: boolean;
  variant?: "A" | "B";
  onVariant?: (v: "A" | "B") => void;
}) {
  const lead = leads.find((l) => l.id === leadId) ?? leads[0] ?? null;
  const name = lead ? [lead.firstName, lead.lastName].filter(Boolean).join(" ") || lead.company || "Destinataire" : "Camille Martin";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
        <Select
          size="small"
          value={lead?.id}
          onChange={onLead}
          disabled={leads.length === 0}
          placeholder="Lead d'exemple"
          suffixIcon={<UserOutlined />}
          style={{ minWidth: 220 }}
          options={leads.map((l) => ({ value: l.id, label: `${[l.firstName, l.lastName].filter(Boolean).join(" ") || "—"} · ${l.company ?? "—"}` }))}
        />
        {variants && onVariant && (
          <Segmented size="small" value={variant} onChange={(v) => onVariant(v as "A" | "B")} options={[{ value: "A", label: "Variante A" }, { value: "B", label: "Variante B" }]} />
        )}
      </div>

      <div style={{ borderRadius: 18, overflow: "hidden", border: "1px solid var(--nb-border)", boxShadow: "0 24px 60px -30px rgba(0,0,0,0.5)" }}>
        <div style={{ display: "flex", gap: 6, padding: "10px 14px", background: "var(--nb-control)", borderBottom: "1px solid var(--nb-border)" }}>
          {["#fb7185", "#fbbf24", "#34d399"].map((c) => <span key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c, opacity: 0.8 }} />)}
        </div>
        <div style={{ padding: "16px 20px", display: "grid", gap: 6, borderBottom: "1px solid var(--nb-border)", background: "var(--nb-surface)" }}>
          <div className="nb-display" style={{ fontSize: 17, fontWeight: 650, color: "var(--nb-text-strong)" }}>
            {personalizePreview(subject || "(objet vide)", lead)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12.5, color: "var(--nb-text-2)" }}>
            <span style={{ width: 30, height: 30, borderRadius: "50%", background: palette.gradient, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
              {(fromName || "C").charAt(0).toUpperCase()}
            </span>
            <div style={{ minWidth: 0 }}>
              <div><b style={{ color: "var(--nb-text-strong)" }}>{fromName || "Expéditeur"}</b> &lt;{fromEmail || "—"}&gt;</div>
              <div>À : {name}{lead?.email ? ` <${lead.email}>` : ""}</div>
            </div>
            {ai && <span style={{ marginLeft: "auto" }}><AIBadge>Réécrit par l'IA</AIBadge></span>}
          </div>
        </div>
        {/* Le corps d'un email est conçu pour un fond blanc : on le rend tel que le prospect le verra. */}
        <div style={{ background: "#ffffff", color: "#1f2937", padding: "22px 24px", maxHeight: 420, overflow: "auto", fontSize: 14, lineHeight: 1.6 }}>
          {html ? <SafeHtml html={personalizePreview(html, lead)} /> : <span style={{ color: "#9ca3af" }}>Choisissez un template pour voir le message.</span>}
        </div>
      </div>
      {ai && (
        <div style={{ fontSize: 12, color: "var(--nb-text-3)", lineHeight: 1.6 }}>
          Aperçu du template avec les variables remplacées. À l&apos;envoi, l&apos;IA réécrit ce message pour chaque destinataire
          à partir de son enrichissement (activité, signaux, décideur) — les liens et le suivi restent intacts.
        </div>
      )}
    </div>
  );
}
