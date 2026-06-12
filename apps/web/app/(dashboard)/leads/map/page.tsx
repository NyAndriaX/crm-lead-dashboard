"use client";

/**
 * Vue carte des leads (L-14, optionnel).
 *
 * Géolocalisation par ville (table locale frenchCities — pas d'appel API
 * de géocodage). Marqueurs agrégés par ville (taille ∝ nb de leads).
 * Filtre par rayon : on choisit une ville centre + un rayon en km.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Card, Space, Typography, Select, Slider, Spin, Empty, Tag, List, Button } from "antd";
import { EnvironmentOutlined, ReloadOutlined } from "@ant-design/icons";
import "leaflet/dist/leaflet.css";
import { api } from "@/lib/client";
import { notifyApiError, notifyError, notifyInfo, notifySuccess, notifyWarning } from "@/lib/feedback";
import {
  geocodeCity, distanceKm, FRANCE_CENTER, type LatLng,
} from "@/lib/geo/frenchCities";

const { Title, Text } = Typography;

const MapContainer = dynamic(() => import("react-leaflet").then((m) => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then((m) => m.TileLayer), { ssr: false });
const CircleMarker = dynamic(() => import("react-leaflet").then((m) => m.CircleMarker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then((m) => m.Popup), { ssr: false });
const Circle = dynamic(() => import("react-leaflet").then((m) => m.Circle), { ssr: false });

type Lead = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  city: string | null;
  status: string;
};

type CityGroup = {
  city: string;
  pos: LatLng;
  leads: Lead[];
};

export default function LeadsMapPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [centerCity, setCenterCity] = useState<string | undefined>();
  const [radiusKm, setRadiusKm] = useState(100);

  const fetchLeads = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get<{ data: Lead[] }>("/leads", {
        params: { pageSize: 200 },
      });
      setLeads(data.data);
    } catch (e) { notifyApiError(e, "Impossible de charger les leads."); } finally {
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
    return { groups: Array.from(byCity.values()), ungeocoded: ungeo };
  }, [leads]);

  const centerPos = centerCity ? geocodeCity(centerCity) : null;

  const visibleGroups = useMemo(() => {
    if (!centerPos) return groups;
    return groups.filter((g) => distanceKm(centerPos, g.pos) <= radiusKm);
  }, [groups, centerPos, radiusKm]);

  const cityOptions = useMemo(
    () => Array.from(new Set(groups.map((g) => g.city))).sort().map((c) => ({ value: c, label: c })),
    [groups],
  );

  const totalVisible = visibleGroups.reduce((a, b) => a + b.leads.length, 0);

  return (
    <div style={{ padding: "16px 24px" }}>
      <Space align="center" style={{ width: "100%", justifyContent: "space-between", marginBottom: 16 }} wrap>
        <Space>
          <EnvironmentOutlined style={{ fontSize: 22, color: "#1677ff" }} />
          <Title level={3} style={{ margin: 0 }}>Carte des leads</Title>
          <Link href="/leads"><Button size="small">Vue liste</Button></Link>
        </Space>
        <Button icon={<ReloadOutlined />} onClick={() => fetchLeads()}>Actualiser</Button>
      </Space>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap size={24}>
          <Space>
            <Text strong>Centre :</Text>
            <Select
              allowClear
              placeholder="Toute la France"
              style={{ width: 220 }}
              value={centerCity}
              onChange={setCenterCity}
              showSearch
              options={cityOptions}
            />
          </Space>
          <Space style={{ minWidth: 280 }}>
            <Text strong>Rayon : {radiusKm} km</Text>
            <Slider
              min={10}
              max={800}
              step={10}
              value={radiusKm}
              onChange={setRadiusKm}
              disabled={!centerCity}
              style={{ width: 180 }}
            />
          </Space>
          <Tag color="blue">{totalVisible} lead(s) affiché(s)</Tag>
          {ungeocoded > 0 && (
            <Tag color="orange">{ungeocoded} sans ville géolocalisable</Tag>
          )}
        </Space>
      </Card>

      {loading ? (
        <div style={{ padding: 64, textAlign: "center" }}><Spin size="large" /></div>
      ) : groups.length === 0 ? (
        <Empty description="Aucun lead géolocalisable (villes non reconnues)" />
      ) : (
        <div style={{ height: "calc(100vh - 280px)", minHeight: 420, borderRadius: 8, overflow: "hidden", border: "1px solid #f0f0f0" }}>
          <MapContainer
            center={[centerPos?.lat ?? FRANCE_CENTER.lat, centerPos?.lng ?? FRANCE_CENTER.lng]}
            zoom={centerCity ? 8 : 6}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom
          >
            <TileLayer
              attribution='&copy; OpenStreetMap'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {centerPos && (
              <Circle
                center={[centerPos.lat, centerPos.lng]}
                radius={radiusKm * 1000}
                pathOptions={{ color: "#1677ff", fillOpacity: 0.05 }}
              />
            )}
            {visibleGroups.map((g) => (
              <CircleMarker
                key={g.city}
                center={[g.pos.lat, g.pos.lng]}
                radius={Math.min(8 + g.leads.length * 1.5, 28)}
                pathOptions={{ color: "#1677ff", fillColor: "#1677ff", fillOpacity: 0.55 }}
              >
                <Popup>
                  <div style={{ minWidth: 200, maxHeight: 240, overflow: "auto" }}>
                    <strong>{g.city}</strong> — {g.leads.length} lead(s)
                    <List
                      size="small"
                      dataSource={g.leads.slice(0, 12)}
                      renderItem={(l) => (
                        <List.Item style={{ padding: "4px 0" }}>
                          <a href={`/leads/${l.id}`}>
                            {[l.firstName, l.lastName].filter(Boolean).join(" ") || l.company || "Lead"}
                          </a>
                          <Tag style={{ marginLeft: 8 }}>{l.status}</Tag>
                        </List.Item>
                      )}
                    />
                    {g.leads.length > 12 && (
                      <Text type="secondary" style={{ fontSize: 11 }}>+{g.leads.length - 12} autres…</Text>
                    )}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
