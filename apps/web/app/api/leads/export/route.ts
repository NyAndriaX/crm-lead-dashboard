import * as XLSX from "xlsx";
import { handler, parseQuery, requirePermission } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { exportLeadsQuery } from "@/lib/schemas/lead";
import { collectLeadsForExport, EXPORT_COLUMNS, type ExportColumn } from "@/lib/services/leads";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

// GET /api/leads/export?format=csv|xlsx&columns=...&<filtres> — export du listing courant (CRM-018).
export const GET = handler(async (req) => {
  const s = await requirePermission("leads:read");
  const q = parseQuery(req, exportLeadsQuery);

  const requested = (q.columns?.split(",").map((c) => c.trim()).filter(Boolean) ?? []) as ExportColumn[];
  const columns = (requested.length ? requested.filter((c) => (EXPORT_COLUMNS as readonly string[]).includes(c)) : [...EXPORT_COLUMNS]) as ExportColumn[];

  const rows = await collectLeadsForExport(q, columns);
  await audit({ userId: s.sub, action: "leads.export", ip: clientIp(req), diff: { format: q.format, count: rows.length } });

  const stamp = new Date().toISOString().slice(0, 10);
  if (q.format === "xlsx") {
    const ws = XLSX.utils.json_to_sheet(rows, { header: columns });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="leads-${stamp}.xlsx"`,
      },
    });
  }
  return new Response(toCsv(rows, columns), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="leads-${stamp}.csv"`,
    },
  });
});
