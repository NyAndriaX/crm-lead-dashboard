"use client";

/**
 * Centre de commande de la prospection : le robot reflète l'état réel des missions
 * (veille / en mission / résultats prêts / erreur), le radar affiche un point par
 * établissement trouvé (couleur = score d'adéquation IA), les étapes et la console
 * sont alimentées par les logs du job `scraping-run`.
 */
import { useEffect, useMemo, useState } from "react";
import { Button, Space } from "antd";
import { FileSearchOutlined, PlusOutlined, RadarChartOutlined, UserOutlined } from "@ant-design/icons";
import { palette } from "@/lib/theme";
import { ProspectorRobot, type RobotState } from "@/components/ui/ProspectorRobot";
import { RadarScanner } from "@/components/ui/RadarScanner";
import { fitColor, isActive, type BufferItem, type Mission } from "./types";

const STEPS = [
  { key: "queue", label: "Mise en file", detail: "Mission prise en charge par le processeur de tâches" },
  { key: "explore", label: "Exploration Google Maps", detail: "Requêtes, visite des sites, mentions légales" },
  { key: "analyze", label: "Analyse IA & dédoublonnage", detail: "Décideur, meilleur email, score d'adéquation" },
  { key: "done", label: "Leads prêts à valider", detail: "Résultats classés par pertinence" },
];

function currentStep(m: Mission | null): number {
  if (!m) return -1;
  if (m.status === "queued" || m.status === "scheduled") return 0;
  if (m.status === "running") return /Total brut|Analyse IA|Buffer/.test(m.logs ?? "") ? 2 : 1;
  if (m.status === "done") return 3;
  return -1;
}

/** Heure de début déduite de la 1re ligne de log (« HH:MM:SS … », UTC). */
function startedAt(m: Mission | null): number | null {
  const first = m?.logs?.split("\n").find((l) => /^\d{2}:\d{2}:\d{2} /.test(l));
  if (!first) return null;
  const [h, min, s] = first.slice(0, 8).split(":").map(Number);
  const d = new Date();
  d.setUTCHours(h ?? 0, min ?? 0, s ?? 0, 0);
  if (d.getTime() > Date.now()) d.setUTCDate(d.getUTCDate() - 1);
  return d.getTime();
}

function useElapsed(from: number | null, running: boolean): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!from) return "00:00";
  const sec = Math.max(0, Math.floor((now - from) / 1000));
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

export function CommandCenter({
  focus,
  results,
  onCreate,
  onOpenResults,
}: {
  focus: Mission | null;
  results: BufferItem[];
  onCreate: () => void;
  onOpenResults: (m: Mission) => void;
}) {
  const running = !!focus && isActive(focus);
  const step = currentStep(focus);
  const elapsed = useElapsed(startedAt(focus), running);
  const state: RobotState = running ? "scanning" : focus?.status === "error" ? "error" : results.length > 0 ? "success" : "idle";

  const top = useMemo(
    () =>
      [...results]
        .filter((r) => !r.raw.duplicate && r.status !== "rejected")
        .sort((a, b) => (b.raw.ai?.fit_score ?? -1) - (a.raw.ai?.fit_score ?? -1))
        .slice(0, 5),
    [results],
  );
  const blips = results.map((r) => ({ id: r.id, score: r.raw.ai?.fit_score ?? null }));
  const logLines = (focus?.logs ?? "").split("\n").filter(Boolean).slice(-6);

  const headline = running
    ? "Le robot explore Google Maps…"
    : focus?.status === "error"
      ? "La dernière mission a échoué"
      : focus && focus.bufferCounts.pending > 0
        ? `${focus.bufferCounts.pending} lead(s) prêt(s) à valider`
        : focus && results.length > 0
          ? focus.bufferCounts.accepted > 0
            ? `${focus.bufferCounts.accepted} lead(s) ajouté(s) au CRM`
            : `${results.length} fiche(s) analysée(s), aucune dans la cible`
          : "Votre robot de prospection est prêt";

  return (
    <div className="nb-glass nb-gradient-border" style={{ borderRadius: 24, padding: 26, position: "relative", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          background: running
            ? "radial-gradient(ellipse at 20% 50%, rgba(167, 139, 250,0.22), transparent 55%)"
            : "radial-gradient(ellipse at 20% 50%, rgba(139,92,246,0.2), transparent 55%)",
          transition: "background 0.8s",
        }}
      />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 220px) minmax(0, 1fr) minmax(220px, 280px)", gap: 28, alignItems: "center", position: "relative" }} className="cc-grid">
        {/* Robot */}
        <div style={{ display: "flex", justifyContent: "center", position: "relative" }}>
          <ProspectorRobot state={state} size={200} />
          {running && (
            <div className="nb-mono" style={{ position: "absolute", bottom: -4, left: "50%", transform: "translateX(-50%)", fontSize: 12, color: palette.cyan, letterSpacing: 2 }}>
              ⏱ {elapsed}
            </div>
          )}
        </div>

        {/* Statut + étapes / console */}
        <div style={{ minWidth: 0 }}>
          <div className="nb-eyebrow" style={{ color: running ? palette.cyan : undefined }}>
            {running ? "● Mission en cours" : focus ? `${focus.bufferCounts.pending > 0 ? "À valider" : "Dernière mission"} · ${focus.name}` : "Centre de commande"}
          </div>
          <h2 className="nb-display" style={{ margin: "8px 0 6px", fontSize: 28, fontWeight: 700, color: "var(--nb-text-strong)", lineHeight: 1.15 }}>
            {running ? <span className="nb-gradient-text">{headline}</span> : headline}
          </h2>
          <div style={{ color: palette.textSecondary, marginBottom: 18, fontSize: 14 }}>
            {running
              ? `« ${focus?.name} » — ${focus?.config.queries?.length ? `${focus.config.queries.length} requêtes` : focus?.config.keywords} · ${focus?.config.limit} fiches visées`
              : "Décrivez votre cible : l'IA conçoit les requêtes, le robot explore Google Maps, visite chaque site, identifie le décideur et note chaque entreprise."}
          </div>

          {focus && step >= 0 ? (
            <div style={{ display: "grid", gap: 10 }}>
              {STEPS.map((s, i) => {
                const done = i < step || (i === step && !running);
                const active = i === step && running;
                const color = done ? palette.green : active ? palette.cyan : palette.textTertiary;
                return (
                  <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 12, opacity: i > step ? 0.45 : 1, transition: "opacity 0.4s" }}>
                    <div
                      style={{
                        width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                        border: `2px solid ${color}`, color, fontSize: 12, fontWeight: 700,
                        boxShadow: active ? `0 0 16px ${palette.cyan}` : "none",
                        background: done ? `${palette.green}22` : "transparent",
                      }}
                    >
                      {done ? "✓" : active ? <span style={{ width: 10, height: 10, borderRadius: "50%", border: `2px solid ${palette.cyan}`, borderTopColor: "transparent", animation: "nb-spin 0.8s linear infinite", display: "block" }} /> : i + 1}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: "var(--nb-text-strong)", fontWeight: 600, fontSize: 14 }}>{s.label}</div>
                      <div style={{ color: palette.textTertiary, fontSize: 12 }}>{s.detail}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Space wrap>
              <Button type="primary" size="large" icon={<PlusOutlined />} onClick={onCreate}>Nouvelle mission IA</Button>
            </Space>
          )}

          {running && logLines.length > 0 && (
            <div
              className="nb-mono"
              style={{
                marginTop: 18, padding: "12px 14px", borderRadius: 14, background: "#0b1020", border: "1px solid var(--nb-border)",
                fontSize: 12, lineHeight: 1.7, color: "#cbd5e1", position: "relative", overflow: "hidden",
              }}
            >
              <div className="nb-scanline" />
              {logLines.map((l, i) => (
                <div key={`${i}-${l}`} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", animation: "nb-slide-in 0.4s var(--nb-ease) both" }}>
                  <span style={{ color: palette.cyan }}>›</span> {l}
                </div>
              ))}
              <span style={{ display: "inline-block", width: 8, height: 14, background: palette.cyan, animation: "nb-glow 1s steps(2) infinite", verticalAlign: "middle" }} />
            </div>
          )}
        </div>

        {/* Radar + top opportunités */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          <RadarScanner blips={running ? [] : blips} active={running || results.length === 0} size={220} />
          {!running && top.length > 0 && focus && (
            <div style={{ width: "100%" }}>
              <div className="nb-eyebrow" style={{ marginBottom: 8 }}>Meilleures opportunités</div>
              <div style={{ display: "grid", gap: 6 }}>
                {top.map((r, i) => (
                  <div
                    key={r.id}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 10,
                      background: "rgba(148,163,184,0.06)", animation: `nb-slide-in 0.5s var(--nb-ease) ${i * 0.08}s both`,
                    }}
                  >
                    <span className="nb-mono" style={{ color: fitColor(r.raw.ai?.fit_score), fontWeight: 700, width: 26 }}>
                      {r.raw.ai?.fit_score ?? "—"}
                    </span>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ color: "var(--nb-text-strong)", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.raw.company}</div>
                      {r.raw.name && (
                        <div style={{ color: palette.textTertiary, fontSize: 11 }}><UserOutlined /> {r.raw.name}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <Button block style={{ marginTop: 10 }} icon={<FileSearchOutlined />} onClick={() => onOpenResults(focus)}>
                Valider les résultats
              </Button>
            </div>
          )}
          {running && (
            <div style={{ color: palette.textTertiary, fontSize: 12, textAlign: "center" }}>
              <RadarChartOutlined /> Balayage en cours — vous serez notifié à la fin
            </div>
          )}
        </div>
      </div>
      <style>{`@media (max-width: 1100px) { .cc-grid { grid-template-columns: 1fr !important; justify-items: center; text-align: left; } }`}</style>
    </div>
  );
}
