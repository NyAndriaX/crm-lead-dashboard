"use client";

/**
 * Constructeur de critères d'audience : chaque filtre propose les valeurs réellement présentes
 * en base (GET /api/leads/facets) avec leur volume — pas de saisie libre ni de code brut.
 */
import { useEffect, useState, type ReactNode } from "react";
import { DatePicker, Select, Slider } from "antd";
import {
  AppstoreOutlined, CalendarOutlined, EnvironmentOutlined, FlagOutlined, ImportOutlined, StarOutlined, TagOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { api } from "@/lib/client";
import { palette, statusColors } from "@/lib/theme";
import { STATUS_LABELS } from "@/lib/leadStatus";
import type { Facet, LeadFacets, SegmentFilters } from "./types";

export const FILTER_LABELS: Record<string, string> = {
  status: "Statut", sector: "Secteur", city: "Ville", country: "Pays", source: "Source", tag: "Tag",
  scoreMin: "Score ≥", scoreMax: "Score ≤", createdAfter: "Créé après", q: "Recherche", assignedToId: "Assigné",
};

/** Libellés lisibles des critères actifs (pour les cartes et récapitulatifs). */
export function describeFilters(filters: SegmentFilters | null | undefined): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(filters ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    if (k === "status") out.push(`${FILTER_LABELS.status} : ${STATUS_LABELS[v as keyof typeof STATUS_LABELS] ?? v}`);
    else if (k === "createdAfter") out.push(`${FILTER_LABELS.createdAfter} ${dayjs(String(v)).format("DD/MM/YYYY")}`);
    else out.push(`${FILTER_LABELS[k] ?? k} ${k.startsWith("score") ? "" : ": "}${String(v)}`);
  }
  return out;
}

function Criterion({ icon, label, color, children }: { icon: ReactNode; label: string; color: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, fontWeight: 600, color: "var(--nb-text-2)" }}>
        <span style={{ width: 24, height: 24, borderRadius: 8, display: "inline-flex", alignItems: "center", justifyContent: "center", color, background: `${color}1f` }}>{icon}</span>
        {label}
      </div>
      {children}
    </div>
  );
}

function facetOptions(list: Facet[] | undefined) {
  return (list ?? []).map((f) => ({
    value: f.value,
    label: (
      <span style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <span>{f.value}</span>
        <span className="nb-mono" style={{ color: "var(--nb-text-3)", fontSize: 12 }}>{f.count}</span>
      </span>
    ),
    search: f.value,
  }));
}

export function SegmentFilterBuilder({ value, onChange }: { value: SegmentFilters; onChange: (next: SegmentFilters) => void }) {
  const [facets, setFacets] = useState<LeadFacets | null>(null);

  useEffect(() => {
    api.get<{ data: LeadFacets }>("/leads/facets").then((r) => setFacets(r.data.data)).catch(() => setFacets(null));
  }, []);

  const set = (patch: Partial<SegmentFilters>) => onChange({ ...value, ...patch });
  const select = (key: keyof SegmentFilters, list: Facet[] | undefined, placeholder: string) => (
    <Select
      allowClear
      showSearch
      placeholder={placeholder}
      value={(value[key] as string | undefined) ?? undefined}
      onChange={(v) => set({ [key]: v ?? undefined })}
      options={facetOptions(list)}
      optionFilterProp="search"
      loading={!facets}
      style={{ width: "100%" }}
    />
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Criterion icon={<FlagOutlined />} label="Étape commerciale" color={palette.violet}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {[undefined, ...Object.keys(STATUS_LABELS)].map((s) => {
            const active = value.status === s;
            const color = s ? statusColors[s] ?? palette.violet : palette.violet;
            return (
              <button
                key={s ?? "all"}
                type="button"
                onClick={() => set({ status: s })}
                style={{
                  cursor: "pointer", borderRadius: 999, padding: "6px 14px", fontSize: 13, fontWeight: 600, transition: "all .2s var(--nb-ease)",
                  border: `1px solid ${active ? color : "var(--nb-border)"}`,
                  background: active ? `${color}24` : "var(--nb-control)",
                  color: active ? color : "var(--nb-text-2)",
                  boxShadow: active ? `0 0 16px -6px ${color}` : "none",
                }}
              >
                {s ? STATUS_LABELS[s as keyof typeof STATUS_LABELS] : "Tous les statuts"}
              </button>
            );
          })}
        </div>
      </Criterion>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <Criterion icon={<AppstoreOutlined />} label="Secteur" color={palette.cyan}>{select("sector", facets?.sectors, "Tous les secteurs")}</Criterion>
        <Criterion icon={<EnvironmentOutlined />} label="Ville" color={palette.pink}>{select("city", facets?.cities, "Toutes les villes")}</Criterion>
        <Criterion icon={<TagOutlined />} label="Tag" color={palette.amber}>{select("tag", facets?.tags, "Aucun tag requis")}</Criterion>
        <Criterion icon={<ImportOutlined />} label="Source" color={palette.blue}>{select("source", facets?.sources, "Toutes les sources")}</Criterion>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        <Criterion icon={<StarOutlined />} label={`Score de potentiel : ${value.scoreMin ?? 0} – ${value.scoreMax ?? 100}`} color={palette.green}>
          <Slider
            range
            min={0}
            max={100}
            step={5}
            value={[value.scoreMin ?? 0, value.scoreMax ?? 100]}
            onChange={(v) => {
              const [min = 0, max = 100] = v as number[];
              set({ scoreMin: min > 0 ? min : undefined, scoreMax: max < 100 ? max : undefined });
            }}
            marks={{ 0: "0", 50: "50", 80: "80", 100: "100" }}
          />
        </Criterion>
        <Criterion icon={<CalendarOutlined />} label="Leads arrivés après le" color={palette.indigo}>
          <DatePicker
            style={{ width: "100%" }}
            format="DD/MM/YYYY"
            value={value.createdAfter ? dayjs(value.createdAfter) : null}
            onChange={(d) => set({ createdAfter: d ? d.startOf("day").toISOString() : undefined })}
            placeholder="Depuis toujours"
          />
        </Criterion>
      </div>
    </div>
  );
}
