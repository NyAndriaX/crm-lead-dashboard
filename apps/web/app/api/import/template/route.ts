/**
 * GET /api/import/template?format=xlsx|csv — modèle d'import téléchargeable (I-02).
 *
 * Génère un fichier pré-rempli avec :
 *   - les colonnes attendues par le worker d'import (cf. apps/worker/src/handlers/index.ts processImport)
 *   - 3 lignes d'exemple pour aider l'utilisateur à formater son fichier.
 */
import { z } from "zod";
import * as XLSX from "xlsx";
import { handler, parseQuery, requirePermission } from "@/lib/api";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  format: z.enum(["xlsx", "csv"]).optional().default("xlsx"),
});

const COLUMNS = [
  "email", "phone", "firstName", "lastName", "company", "website",
  "sector", "city", "country", "source", "notes",
];

const EXAMPLES: Record<string, string>[] = [
  {
    email: "marie.dupont@exemple.fr",
    phone: "+33 6 12 34 56 78",
    firstName: "Marie",
    lastName: "Dupont",
    company: "Exemple SAS",
    website: "https://exemple.fr",
    sector: "SaaS",
    city: "Paris",
    country: "France",
    source: "Salon",
    notes: "Rencontrée au salon B2B",
  },
  {
    email: "p.martin@acme-tech.com",
    phone: "",
    firstName: "Paul",
    lastName: "Martin",
    company: "ACME Tech",
    website: "",
    sector: "Industrie",
    city: "Lyon",
    country: "France",
    source: "Inbound",
    notes: "",
  },
  {
    email: "",
    phone: "+33 7 65 43 21 09",
    firstName: "Sophie",
    lastName: "Lefèvre",
    company: "Lefèvre Conseil",
    website: "https://lefevre-conseil.fr",
    sector: "Conseil",
    city: "Bordeaux",
    country: "France",
    source: "Cold call",
    notes: "Souhaite être recontactée en septembre",
  },
];

function rowsToCsv(): string {
  const esc = (v: unknown): string => {
    const s = v == null ? "" : String(v);
    if (/[";\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [
    COLUMNS.join(";"),
    ...EXAMPLES.map((r) => COLUMNS.map((c) => esc(r[c])).join(";")),
  ].join("\n");
}

export const GET = handler(async (req) => {
  await requirePermission("import:run");
  const { format } = parseQuery(req, querySchema);
  const fileBase = `modele-import-leads-${new Date().toISOString().slice(0, 10)}`;

  if (format === "csv") {
    const csv = "﻿" + rowsToCsv(); // BOM Excel FR
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
      },
    });
  }

  const wb = XLSX.utils.book_new();
  const rows = EXAMPLES.map((ex) => Object.fromEntries(COLUMNS.map((c) => [c, ex[c] ?? ""])));
  const ws = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });
  // Largeur de colonnes plus lisible
  ws["!cols"] = COLUMNS.map((c) => ({ wch: c === "notes" ? 30 : c === "email" || c === "website" ? 26 : 16 }));
  XLSX.utils.book_append_sheet(wb, ws, "Leads");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
    },
  });
});
