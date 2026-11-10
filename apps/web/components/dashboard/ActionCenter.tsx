"use client";

/** « À traiter maintenant » : chaque carte mène directement à la vue filtrée où agir. */
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Skeleton } from "antd";
import {
  ArrowRightOutlined, CheckCircleFilled, FireOutlined, MailOutlined, MessageOutlined, PauseCircleOutlined, RadarChartOutlined,
  RetweetOutlined, UserAddOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";
import { palette } from "@/lib/theme";

type Actions = { hotReplies: number; toValidate: number; hotIdle: number; unassignedHot: number; sendsToday: number; drafts: number; paused: number };
type Card = { key: keyof Actions; icon: ReactNode; color: string; title: (n: number) => string; hint: string; href: string; urgent?: boolean };

const CARDS: Card[] = [
  { key: "hotReplies", icon: <MessageOutlined />, color: palette.green, urgent: true, title: (n) => `${n} réponse${n > 1 ? "s" : ""} intéressée${n > 1 ? "s" : ""} à traiter`, hint: "Classées « intéressé » ou « rappel » par Claude, non lues", href: "/inbox?category=interesse" },
  { key: "toValidate", icon: <RadarChartOutlined />, color: palette.cyan, urgent: true, title: (n) => `${n} établissement${n > 1 ? "s" : ""} trouvé${n > 1 ? "s" : ""} à valider`, hint: "Résultats de prospection IA en attente", href: "/scraping" },
  { key: "hotIdle", icon: <FireOutlined />, color: palette.amber, title: (n) => `${n} lead${n > 1 ? "s" : ""} chaud${n > 1 ? "s" : ""} sans suivi depuis 7 jours`, hint: "Score ≥ 70, encore en prospection", href: "/leads?scoreMin=70" },
  { key: "unassignedHot", icon: <UserAddOutlined />, color: palette.pink, title: (n) => `${n} lead${n > 1 ? "s" : ""} chaud${n > 1 ? "s" : ""} sans commercial`, hint: "À répartir dans l'équipe", href: "/leads?scoreMin=70" },
  { key: "sendsToday", icon: <RetweetOutlined />, color: palette.violet, title: (n) => `${n} relance${n > 1 ? "s" : ""} part${n > 1 ? "ent" : ""} aujourd'hui`, hint: "Séquences actives, envoi automatique", href: "/sequences" },
  { key: "drafts", icon: <MailOutlined />, color: palette.blue, title: (n) => `${n} campagne${n > 1 ? "s" : ""} en brouillon`, hint: "Prête(s) à être vérifiée(s) et lancée(s)", href: "/campaigns" },
  { key: "paused", icon: <PauseCircleOutlined />, color: palette.amber, title: (n) => `${n} campagne${n > 1 ? "s" : ""} en pause`, hint: "À reprendre ou clôturer", href: "/campaigns" },
];

export function ActionCenter() {
  const [data, setData] = useState<Actions | null>(null);

  useEffect(() => {
    api.get<{ data: Actions }>("/dashboard/actions").then((r) => setData(r.data.data)).catch(() => setData(null));
  }, []);

  if (!data) return <div className="nb-glass" style={{ borderRadius: 20, padding: 22 }}><Skeleton active paragraph={{ rows: 2 }} /></div>;
  const items = CARDS.filter((c) => data[c.key] > 0);

  return (
    <div className="nb-glass" style={{ borderRadius: 20, padding: 22 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div className="nb-display" style={{ fontWeight: 650, fontSize: 16, color: "var(--nb-text-strong)" }}>À traiter maintenant</div>
          <div style={{ fontSize: 12.5, color: "var(--nb-text-3)" }}>Ce qui attend une décision de votre part, par ordre de priorité</div>
        </div>
      </div>
      {items.length === 0 ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--nb-text-2)", fontSize: 14 }}>
          <CheckCircleFilled style={{ color: palette.green, fontSize: 20 }} /> Rien d&apos;urgent : la prospection tourne toute seule.
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }} className="nb-stagger">
          {items.map((c) => (
            <Link
              key={c.key}
              href={c.href}
              className="nb-lift"
              style={{
                display: "flex", gap: 12, alignItems: "center", padding: "14px 16px", borderRadius: 16, color: "inherit",
                border: `1px solid ${c.urgent ? `${c.color}66` : "var(--nb-border)"}`, background: c.urgent ? `${c.color}10` : "var(--nb-control)",
              }}
            >
              <span style={{ position: "relative", width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", color: c.color, background: `${c.color}1f`, fontSize: 17 }}>
                {c.icon}
                {c.urgent && <span className="nb-pulse-dot" style={{ position: "absolute", top: -3, right: -3, width: 9, height: 9, borderRadius: "50%", background: c.color, color: c.color }} />}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 650, fontSize: 13.5, color: "var(--nb-text-strong)" }}>{c.title(data[c.key])}</div>
                <div style={{ fontSize: 11.5, color: "var(--nb-text-3)", marginTop: 2 }}>{c.hint}</div>
              </div>
              <ArrowRightOutlined style={{ color: "var(--nb-text-3)" }} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
