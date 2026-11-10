"use client";

/**
 * Page /scraping — Prospection IA (S-01 → S-10).
 * Centre de commande (robot, radar, étapes), missions, assistant IA, validation des résultats.
 */
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Col, Empty, Modal, Row, Skeleton, message } from "antd";
import {
  AimOutlined, CheckCircleOutlined, PlusOutlined, RadarChartOutlined, ReloadOutlined, ThunderboltOutlined, HourglassOutlined,
} from "@ant-design/icons";
import { api } from "@/lib/client";
import { palette } from "@/lib/theme";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { StatusPill } from "@/components/ui/Brand";
import { CommandCenter } from "@/components/scraping/CommandCenter";
import { MissionCard } from "@/components/scraping/MissionCard";
import { MissionDrawer } from "@/components/scraping/MissionDrawer";
import { ResultsDrawer } from "@/components/scraping/ResultsDrawer";
import { LogsDrawer } from "@/components/scraping/LogsDrawer";
import { apiError, isActive, type BufferItem, type Mission, type ScrapingStatus } from "@/components/scraping/types";

function ScrapingPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const autoOpenRef = useRef<string | null>(searchParams.get("openResults"));
  const [modal, modalHolder] = Modal.useModal();

  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ScrapingStatus | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Mission | null>(null);
  const [logsTarget, setLogsTarget] = useState<Mission | null>(null);
  const [resultsTarget, setResultsTarget] = useState<Mission | null>(null);
  const [results, setResults] = useState<BufferItem[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [focusResults, setFocusResults] = useState<BufferItem[]>([]);

  const fetchMissions = useCallback(async () => {
    try {
      const { data } = await api.get<{ data: Mission[] }>("/scraping/missions");
      setMissions(data.data);
    } catch {
      message.error("Impossible de charger les missions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMissions();
    const loadStatus = () =>
      api.get<{ data: ScrapingStatus }>("/scraping/status").then((r) => setStatus(r.data.data)).catch(() => setStatus(null));
    void loadStatus();
    const t = setInterval(() => void loadStatus(), 20_000);
    return () => clearInterval(t);
  }, [fetchMissions]);

  // Rafraîchissement tant qu'une mission tourne (le robot suit l'avancement).
  useEffect(() => {
    if (!missions.some(isActive)) return;
    const t = setInterval(() => void fetchMissions(), 3000);
    return () => clearInterval(t);
  }, [missions, fetchMissions]);

  // Mission mise en avant : celle en cours, sinon une mission avec des résultats à valider,
  // sinon la plus récemment active (lancement, fin, erreur).
  const focus = useMemo(() => {
    const active = missions.find(isActive);
    if (active) return active;
    const lastActivity = (m: Mission) => new Date(m.updatedAt ?? m.createdAt).getTime();
    const finished = missions.filter((m) => m.status === "done" || m.status === "error").sort((a, b) => lastActivity(b) - lastActivity(a));
    return finished.find((m) => m.bufferCounts.pending > 0) ?? finished[0] ?? null;
  }, [missions]);

  const focusKey = focus ? `${focus.id}:${focus.status}:${focus.bufferCounts.pending}:${focus.bufferCounts.accepted}` : "";
  useEffect(() => {
    if (!focus || isActive(focus)) { setFocusResults([]); return; }
    api.get<{ data: BufferItem[] }>(`/scraping/missions/${focus.id}/results`).then((r) => setFocusResults(r.data.data)).catch(() => setFocusResults([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  const loadResults = useCallback(async (m: Mission) => {
    setResultsLoading(true);
    try {
      const { data } = await api.get<{ data: BufferItem[] }>(`/scraping/missions/${m.id}/results`);
      setResults(data.data);
    } catch {
      message.error("Impossible de charger les résultats.");
    } finally {
      setResultsLoading(false);
    }
  }, []);

  function openResults(m: Mission) {
    setResultsTarget(m);
    void loadResults(m);
  }

  // Lien de notification : ?openResults=<id>
  useEffect(() => {
    const id = autoOpenRef.current;
    if (!id || missions.length === 0) return;
    const m = missions.find((x) => x.id === id);
    if (m) {
      autoOpenRef.current = null;
      openResults(m);
      router.replace("/scraping", { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missions]);

  async function runMission(m: Mission) {
    try {
      await api.post(`/scraping/missions/${m.id}/run`);
      message.success("Robot lancé — il explore Google Maps en arrière-plan.");
      void fetchMissions();
    } catch (e) {
      message.error(apiError(e, "Lancement impossible"));
    }
  }

  function confirmDelete(m: Mission) {
    void modal.confirm({
      title: `Supprimer « ${m.name} » ?`,
      content: "La mission et ses résultats non injectés seront supprimés.",
      okText: "Supprimer",
      okButtonProps: { danger: true },
      cancelText: "Annuler",
      onOk: async () => {
        try {
          await api.delete(`/scraping/missions/${m.id}`);
          message.success("Mission supprimée");
          void fetchMissions();
        } catch {
          message.error("Suppression impossible");
        }
      },
    });
  }

  const totals = missions.reduce(
    (acc, m) => ({
      pending: acc.pending + m.bufferCounts.pending,
      accepted: acc.accepted + m.bufferCounts.accepted,
      running: acc.running + (isActive(m) ? 1 : 0),
    }),
    { pending: 0, accepted: 0, running: 0 },
  );

  const scraperPill = !status
    ? <StatusPill ok={null} label="Scraper…" />
    : !status.live
      ? <StatusPill ok={null} label="Scraper : mode simulation" />
      : status.scraper?.ok
        ? <StatusPill ok label="Scraper connecté" />
        : totals.running > 0
          // Pendant une mission, le scraper peut tarder à répondre au contrôle de santé.
          ? <StatusPill ok={null} label="Scraper en mission" />
          : <StatusPill ok={false} label="Scraper hors ligne" />;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {modalHolder}
      <PageHeader
        icon={<RadarChartOutlined />}
        title="Prospection"
        highlight="IA"
        subtitle="Google Maps × IA : le robot trouve, analyse et qualifie vos futurs clients."
        badges={
          <>
            {scraperPill}
            <StatusPill ok={status ? status.ai : null} label={status?.ai ? "IA active" : "IA désactivée"} />
          </>
        }
        extra={
          <>
            <Button icon={<ReloadOutlined />} onClick={() => void fetchMissions()}>Actualiser</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>Nouvelle mission</Button>
          </>
        }
      />

      <CommandCenter
        focus={focus}
        results={focusResults}
        onCreate={() => { setEditing(null); setDrawerOpen(true); }}
        onOpenResults={openResults}
      />

      <Row gutter={[16, 16]} className="nb-stagger">
        <Col xs={12} xl={6}><StatCard label="Missions" value={missions.length} icon={<AimOutlined />} color={palette.violet} /></Col>
        <Col xs={12} xl={6}><StatCard label="En cours" value={totals.running} icon={<HourglassOutlined />} color={palette.cyan} /></Col>
        <Col xs={12} xl={6}><StatCard label="Leads à valider" value={totals.pending} icon={<ThunderboltOutlined />} color={palette.amber} /></Col>
        <Col xs={12} xl={6}><StatCard label="Leads acceptés" value={totals.accepted} icon={<CheckCircleOutlined />} color={palette.green} /></Col>
      </Row>

      <div>
        <div className="nb-eyebrow" style={{ marginBottom: 12 }}>Missions</div>
        {loading ? (
          <Row gutter={[16, 16]}>
            {[0, 1, 2].map((i) => <Col key={i} xs={24} md={12} xl={8}><div className="nb-glass" style={{ borderRadius: 20, padding: 20 }}><Skeleton active /></div></Col>)}
          </Row>
        ) : missions.length === 0 ? (
          <div className="nb-glass" style={{ borderRadius: 20, padding: 40 }}>
            <Empty description="Aucune mission — créez la première avec l'assistant IA.">
              <Button type="primary" icon={<PlusOutlined />} onClick={() => { setEditing(null); setDrawerOpen(true); }}>Nouvelle mission</Button>
            </Empty>
          </div>
        ) : (
          <Row gutter={[16, 16]} className="nb-stagger">
            {missions.map((m) => (
              <Col key={m.id} xs={24} md={12} xl={8}>
                <MissionCard
                  mission={m}
                  onRun={() => void runMission(m)}
                  onResults={() => openResults(m)}
                  onEdit={() => { setEditing(m); setDrawerOpen(true); }}
                  onLogs={() => setLogsTarget(m)}
                  onDelete={() => confirmDelete(m)}
                />
              </Col>
            ))}
          </Row>
        )}
      </div>

      <MissionDrawer
        open={drawerOpen}
        editing={editing}
        aiAvailable={!!status?.ai}
        onClose={() => setDrawerOpen(false)}
        onSaved={() => { setDrawerOpen(false); void fetchMissions(); }}
      />
      <LogsDrawer mission={logsTarget} onClose={() => setLogsTarget(null)} />
      <ResultsDrawer
        mission={resultsTarget}
        items={results}
        loading={resultsLoading}
        onClose={() => setResultsTarget(null)}
        onChanged={() => {
          if (resultsTarget) void loadResults(resultsTarget);
          void fetchMissions();
        }}
      />
    </div>
  );
}

export default function ScrapingPage() {
  return (
    <Suspense fallback={null}>
      <ScrapingPageInner />
    </Suspense>
  );
}
