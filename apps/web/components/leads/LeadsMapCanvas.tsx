"use client";

/**
 * Carte Leaflet pilotée directement (sans react-leaflet) : la carte est créée dans un effet
 * et détruite par `map.remove()` au démontage — robuste au double montage du mode strict.
 * Chargé uniquement côté client (dynamic import, ssr: false).
 */
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@/lib/geo/frenchCities";

export type MapGroup = { key: string; label: string; pos: LatLng; count: number; color: string; popupHtml: string };

// Tuiles OpenStreetMap (sans clé) ; la variante sombre est obtenue par un filtre CSS (.nb-map-dark).
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";

export default function LeadsMapCanvas({
  groups, center, zoom, radiusKm, focus, mode,
}: {
  groups: MapGroup[];
  center: LatLng;
  zoom: number;
  radiusKm: number | null;
  focus: LatLng | null;
  mode: "dark" | "light";
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tiles = useRef<L.TileLayer | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: true, scrollWheelZoom: true }).setView([center.lat, center.lng], zoom);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      tiles.current = null;
      layer.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- création unique ; la vue est pilotée par les effets suivants
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || tiles.current) return;
    tiles.current = L.tileLayer(TILE_URL, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(m);
  }, []);

  useEffect(() => {
    const m = map.current;
    const g = layer.current;
    if (!m || !g) return;
    g.clearLayers();
    if (radiusKm != null) {
      L.circle([center.lat, center.lng], { radius: radiusKm * 1000, color: "#8b5cf6", weight: 1.5, fillOpacity: 0.06, dashArray: "6 6" }).addTo(g);
    }
    for (const grp of groups) {
      L.circleMarker([grp.pos.lat, grp.pos.lng], {
        radius: Math.min(9 + grp.count * 1.6, 30),
        color: grp.color,
        weight: 2,
        fillColor: grp.color,
        fillOpacity: 0.45,
      })
        .bindTooltip(`${grp.label} · ${grp.count}`, { direction: "top" })
        .bindPopup(grp.popupHtml, { maxWidth: 280 })
        .addTo(g);
    }
    m.setView([center.lat, center.lng], zoom, { animate: true });
  }, [groups, center.lat, center.lng, zoom, radiusKm]);

  useEffect(() => {
    if (focus && map.current) map.current.flyTo([focus.lat, focus.lng], 11, { duration: 0.8 });
  }, [focus]);

  // Classe de thème sur un parent : Leaflet gère lui-même les classes de son conteneur.
  return (
    <div className={mode === "dark" ? "nb-map-dark" : undefined} style={{ height: "100%", width: "100%" }}>
      <div ref={el} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
