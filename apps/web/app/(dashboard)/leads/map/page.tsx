"use client";

/**
 * Vue carte des leads (L-14).
 *
 * Géolocalisation par ville (table locale frenchCities — pas d'appel API de géocodage).
 * Marqueurs agrégés par ville, colorés selon l'étape dominante ; filtre par rayon autour d'une ville.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button, Col, Row, Select, Skeleton, Slider, message } from "antd";
import { EnvironmentOutlined, ReloadOutlined, UnorderedListOutlined } from "@ant-design/icons";
import { api } from "@/lib/client";
import { palette, statusColors } from "@/lib/theme";
import { STATUS_LABELS } from "@/lib/leadStatus";
import { useThemeMode } from "@/components/ThemeProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { Chip, EmptyState, Panel } from "@/components/ui/Kit";
import { geocodeCity, distanceKm, FRANCE_CENTER, type LatLng } from "@/lib/geo/frenchCities";
import type { MapGroup } from "@/components/leads/LeadsMapCanvas";

const LeadsMapCanvas = dynamic(() => import("@/components/leads/LeadsMapCanvas"), {
  ssr: false,
  loading: () => <Skeleton.Node active style={{ width: "100%", height: "100%" }} />,
});

type Lead = { id: string; firstName: string | null; lastName: string | null; company: string | null; city: string | null; status: string };
type CityGroup = { city: string; pos: LatLng; leads: Lead[] };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const leadLabel = (l: Lead) => [l.firstName, l.lastName].filter(Boolean).join(" ") || l.company || "Lead";

function dominantStatus(leads: Lead[]): string {
  const c: Record<string, number> = {};
  for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "NOUVEAU";
}

export default function LeadsMapPage() {
  const { mode } = useThemeMode();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [centerCity, setCenterCity] = useState<string | undefined>();
  const [radiusKm, setRadiusKm] = useState(100);
  const [focus, setFocus] = useState<LatLng | null>(null);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: Lead[] }>("/leads", { params: { pageSize: 200 } });
      setLeads(data.data);
    } catch {
      message.error("Impossible de charger les leads.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchLeads(); }, [fetchLeads]);

  const { groups, ungeocoded } = useMemo(() => {
    const byCity = new Map<string, CityGroup>();
    let ungeo = 0;
    for (const l of leads) {
      const pos = geocodeCity(l.city);
      if (!pos || !l.city) { ungeo++; continue; }
      const key = l.city.trim().toLowerCase();
      if (!byCity.has(key)) byCity.set(key, { city: l.city, pos, leads: [] });
      byCity.get(key)!.leads.push(l);
    }
    return { groups: [...byCity.values()].sort((a, b) => b.leads.length - a.leads.length), ungeocoded: ungeo };
  }, [leads]);

  const centerPos = centerCity ? geocodeCity(centerCity) : null;
  const visibleGroups = useMemo(
    () => (centerPos ? groups.filter((g) => distanceKm(centerPos, g.pos) <= radiusKm) : groups),
    [groups, centerPos, radiusKm],
  );
  const totalVisible = visibleGroups.reduce((a, b) => a + b.leads.length, 0);

  const mapGroups = useMemo<MapGroup[]>(
    () =>
      visibleGroups.map((g) => {
        const st = dominantStatus(g.leads);
        const items = g.leads
          .slice(0, 12)
          .map((l) => `<li><a href="/leads/${esc(l.id)}">${esc(leadLabel(l))}</a> <small>· ${esc(STATUS_LABELS[l.status as keyof typeof STATUS_LABELS] ?? l.status)}</small></li>`)
          .join("");
        const more = g.leads.length > 12 ? `<div><small>+${g.leads.length - 12} autres…</small></div>` : "";
        return {
          key: g.city,
          label: g.city,
          pos: g.pos,
          count: g.leads.length,
          color: statusColors[st] ?? palette.violet,
          popupHtml: `<strong>${esc(g.city)}</strong> — ${g.leads.length} lead(s)<ul style="padding-left:16px;margin:6px 0">${items}</ul>${more}`,
        };
      }),
    [visibleGroups],
  );

  return (
    <div style={{ display: "grid", gap: 20, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <PageHeader
        icon={<EnvironmentOutlined />}
        title="Carte des"
        highlight="leads"
        subtitle="Où sont vos prospects ? Marqueurs regroupés par ville, colorés selon l'étape commerciale dominante."
        extra={
          <>
            <Link href="/leads"><Button icon={<UnorderedListOutlined />}>Vue liste</Button></Link>
            <Button icon={<ReloadOutlined />} onClick={() => void fetchLeads()}>Actualiser</Button>
          </>
        }
      />

      <div className="nb-glass" style={{ borderRadius: 18, padding: "14px 18px", display: "flex", flexWrap: "wrap", gap: 20, alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="nb-eyebrow">Centre</span>
          <Select
            allowClear
            showSearch
            placeholder="Toute la France"
            style={{ width: 220 }}
            value={centerCity}
            onChange={(v) => { setCenterCity(v); setFocus(null); }}
            options={groups.map((g) => ({ value: g.city, label: `${g.city} (${g.leads.length})` }))}
          />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 260 }}>
          <span className="nb-eyebrow">Rayon {radiusKm} km</span>
          <Slider min={10} max={800} step={10} value={radiusKm} onChange={setRadiusKm} disabled={!centerCity} style={{ width: 170 }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap" }}>
          <Chip color={palette.violet}>{totalVisible} lead(s) affiché(s)</Chip>
          {ungeocoded > 0 && <Chip color={palette.amber}>{ungeocoded} sans ville reconnue</Chip>}
        </div>
      </div>

      {loading ? (
        <Panel><Skeleton active paragraph={{ rows: 10 }} /></Panel>
      ) : groups.length === 0 ? (
        <Panel><EmptyState title="Aucun lead géolocalisable" description="Les villes des leads ne sont pas reconnues par la table locale." /></Panel>
      ) : (
        <Row gutter={[20, 20]} align="top">
          <Col xs={24} xl={17}>
            <div className="nb-glass" style={{ height: "calc(100vh - 300px)", minHeight: 440, borderRadius: 20, overflow: "hidden", padding: 0 }}>
              <LeadsMapCanvas
                groups={mapGroups}
                center={centerPos ?? FRANCE_CENTER}
                zoom={centerPos ? 8 : 6}
                radiusKm={centerPos ? radiusKm : null}
                focus={focus}
                mode={mode}
              />
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 10, fontSize: 12, color: "var(--nb-text-2)" }}>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: statusColors[k] }} /> {v}
                </span>
              ))}
            </div>
          </Col>
          <Col xs={24} xl={7}>
            <Panel icon={<EnvironmentOutlined />} title="Villes" subtitle={`${visibleGroups.length} ville(s) — cliquez pour zoomer`} accent={palette.cyan}>
              <div style={{ display: "grid", gap: 6, maxHeight: "calc(100vh - 420px)", minHeight: 300, overflow: "auto" }}>
                {visibleGroups.map((g) => {
                  const st = dominantStatus(g.leads);
                  const max = visibleGroups[0]?.leads.length ?? 1;
                  return (
                    <button
                      key={g.city}
                      type="button"
                      onClick={() => setFocus({ ...g.pos })}
                      style={{ display: "grid", gap: 6, padding: "9px 12px", borderRadius: 12, border: "1px solid var(--nb-border)", background: "var(--nb-control)", textAlign: "left", cursor: "pointer" }}
                    >
                      <span style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span style={{ fontWeight: 600, color: "var(--nb-text-strong)" }}>{g.city}</span>
                        <span className="nb-mono" style={{ color: statusColors[st], fontWeight: 700 }}>{g.leads.length}</span>
                      </span>
                      <span style={{ height: 4, borderRadius: 4, background: "var(--nb-border)", overflow: "hidden" }}>
                        <span style={{ display: "block", width: `${(g.leads.length / max) * 100}%`, height: "100%", background: statusColors[st] }} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </Panel>
          </Col>
        </Row>
      )}
    </div>
  );
}
