/**
 * GET /api/integrations/crm-export?target=hubspot|pipedrive|salesforce
 *     &format=csv|xlsx&<filtres leads> — INT-02.
 *
 * Exporte les leads (filtres standard réutilisés) avec les en-têtes de
 * colonnes attendus par le CRM cible, prêt à réimporter chez eux.
 */
import * as XLSX from "xlsx";
import { z } from "zod";
import { handler, parseQuery, requirePermission, ApiError } from "@/lib/api";
import { audit, clientIp } from "@/lib/audit";
import { exportLeadsQuery } from "@/lib/schemas/lead";
import { collectLeadsForExport, EXPORT_COLUMNS, type ExportColumn } from "@/lib/services/leads";
import { toScope } from "@/lib/scope";
import { toCsv } from "@/lib/csv";
import {
  mapRowToCrm, crmHeaders, CRM_TARGETS, type CrmTarget,
} from "@/lib/services/crmIntegrations";

export const dynamic = "force-dynamic";

const querySchema = exportLeadsQuery.extend({
  target: z.enum(["hubspot", "pipedrive", "salesforce"]),
});

export const GET = handler(async (req) => {
  const s = await requirePermission("leads:read");
  const q = parseQuery(req, querySchema);
  const target = q.target as CrmTarget;
  if (!CRM_TARGETS.includes(target)) {
    throw new ApiError(400, "Cible CRM inconnue", "unknown_target");
  }

  const columns = [...EXPORT_COLUMNS] as ExportColumn[];
  const rows = await collectLeadsForExport(q, columns, toScope(s));
  const mapped = rows.map((r) => mapRowToCrm(r as Record<string, unknown>, target));
  const headers = crmHeaders(target);

  await audit({
    userId: s.sub,
    action: "leads.export.crm",
    ip: clientIp(req),
    diff: { target, format: q.format, count: mapped.length },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const fileBase = `leads-${target}-${stamp}`;

  if (q.format === "xlsx") {
    const ws = XLSX.utils.json_to_sheet(mapped, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="${fileBase}.xlsx"`,
      },
    });
  }

  const csv = toCsv(mapped, headers);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${fileBase}.csv"`,
    },
  });
});
