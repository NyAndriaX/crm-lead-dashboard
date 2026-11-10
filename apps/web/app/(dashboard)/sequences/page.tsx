"use client";

/** Relances : KPIs + séquences (recherche, filtre). Création, édition et suivi ont leurs propres pages. */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Col, Input, Modal, Row, Segmented, Skeleton, message } from "antd";
import { PlusOutlined, RetweetOutlined, SearchOutlined, SendOutlined, TeamOutlined, TrophyOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { AIBadge } from "@/components/ui/Brand";
import { EmptyState, Panel } from "@/components/ui/Kit";
import { SequenceCard, type SequenceStat } from "@/components/sequences/SequenceCard";
import type { SequenceRow } from "@/components/sequences/types";
import { palette } from "@/lib/theme";

type SequenceDashboard = {
  totals: {
    sequences: number; sequencesActive: number; sequencesPaused: number; leadsTotal: number; leadsActive: number;
    leadsCompleted: number; leadsStopped: number; emailsSentFromSequences: number; repliesStopped: number;
  };
  bySequence: (SequenceStat & { id: string })[];
};

export default function SequencesPage() {
  const router = useRouter();
  const [modal, modalHolder] = Modal.useModal();
  const [rows, setRows] = useState<SequenceRow[] | null>(null);
  const [dash, setDash] = useState<SequenceDashboard | null>(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([
        api.get<{ data: SequenceRow[] }>("/sequences"),
        api.get<{ data: SequenceDashboard }>("/sequences/dashboard"),
      ]);
      setRows(s.data.data);
      setDash(d.data.data);
    } catch {
      message.error("Impossible de charger les séquences.");
      setRows([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (r) => (filter === "all" || (filter === "paused") === r.isPaused) && (!q || r.name.toLowerCase().includes(q)),
    );
  }, [rows, filter, query]);

  const togglePause = async (seq: SequenceRow) => {
    try {
      await api.patch(`/sequences/${seq.id}`, { isPaused: !seq.isPaused });
      void load();
    } catch {
      message.error("Échec de la mise à jour.");
    }
  };

  const confirmDelete = (seq: SequenceRow) => {
    void modal.confirm({
      title: `Supprimer « ${seq.name} » ?`,
      content: "Les leads inscrits sortiront de la séquence.",
      okText: "Supprimer",
      okButtonProps: { danger: true },
      cancelText: "Annuler",
      onOk: async () => {
        await api.delete(`/sequences/${seq.id}`);
        message.success("Séquence supprimée");
        void load();
      },
    });
  };

  const paused = (rows ?? []).filter((r) => r.isPaused).length;

  return (
    <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1fr)" }}>
      {modalHolder}
      <PageHeader
        icon={<RetweetOutlined />}
        title="Séquences de"
        highlight="relance"
        subtitle="Relances automatiques multi-étapes : arrêt dès que le prospect répond, chaque email réécrit pour son destinataire."
        badges={<AIBadge>Relances IA</AIBadge>}
        extra={<Link href="/sequences/new"><Button type="primary" icon={<PlusOutlined />}>Nouvelle séquence</Button></Link>}
      />

      <Row gutter={[16, 16]} className="nb-stagger">
        <Col xs={24} sm={12} xl={6}><StatCard label="Séquences" value={dash?.totals.sequences ?? 0} icon={<RetweetOutlined />} color={palette.violet} hint={`${dash?.totals.sequencesActive ?? 0} actives · ${dash?.totals.sequencesPaused ?? 0} en pause`} /></Col>
        <Col xs={24} sm={12} xl={6}><StatCard label="Leads en parcours" value={dash?.totals.leadsActive ?? 0} icon={<TeamOutlined />} color={palette.cyan} hint={`${dash?.totals.leadsTotal ?? 0} inscrits au total`} /></Col>
        <Col xs={24} sm={12} xl={6}><StatCard label="Relances envoyées" value={dash?.totals.emailsSentFromSequences ?? 0} icon={<SendOutlined />} color={palette.pink} hint="Uniques par destinataire (IA)" /></Col>
        <Col xs={24} sm={12} xl={6}><StatCard label="Arrêts sur réponse" value={dash?.totals.repliesStopped ?? 0} icon={<TrophyOutlined />} color={palette.green} hint="Le prospect a répondu : objectif atteint" /></Col>
      </Row>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <Segmented
          value={filter}
          onChange={(v) => setFilter(String(v))}
          options={[
            { value: "all", label: `Toutes · ${rows?.length ?? 0}` },
            { value: "active", label: `Actives · ${(rows?.length ?? 0) - paused}` },
            { value: "paused", label: `En pause · ${paused}` },
          ]}
        />
        <Input prefix={<SearchOutlined style={{ color: "var(--nb-text-3)" }} />} placeholder="Rechercher une séquence" allowClear value={query} onChange={(e) => setQuery(e.target.value)} style={{ width: 260, marginLeft: "auto" }} />
      </div>

      {rows === null ? (
        <Row gutter={[16, 16]}>{[0, 1, 2].map((i) => <Col key={i} xs={24} md={12} xl={8}><Panel><Skeleton active /></Panel></Col>)}</Row>
      ) : visible.length === 0 ? (
        <Panel>
          <EmptyState
            title={rows.length ? "Aucune séquence ne correspond" : "Aucune séquence"}
            description={rows.length ? "Modifiez le filtre ou la recherche." : "Construisez un parcours de relances : chaque email est réécrit pour son destinataire et s'arrête dès qu'il répond."}
            action={<Link href="/sequences/new"><Button type="primary" icon={<PlusOutlined />}>Nouvelle séquence</Button></Link>}
          />
        </Panel>
      ) : (
        <Row gutter={[16, 16]} className="nb-stagger">
          {visible.map((r) => (
            <Col key={r.id} xs={24} md={12} xl={8}>
              <SequenceCard
                name={r.name}
                steps={r.steps ?? []}
                isPaused={r.isPaused}
                stat={dash?.bySequence.find((b) => b.id === r.id) ?? null}
                onOpen={() => router.push(`/sequences/${r.id}`)}
                onLeads={() => router.push(`/sequences/${r.id}`)}
                onEdit={() => router.push(`/sequences/${r.id}/edit`)}
                onTogglePause={() => void togglePause(r)}
                onDelete={() => confirmDelete(r)}
              />
            </Col>
          ))}
        </Row>
      )}
    </div>
  );
}
