/**
 * Spécification OpenAPI 3.1 — CRM-008.
 * Construite à partir des schémas Zod (zod-to-openapi).
 *
 * Modules documentés :
 *  - Auth (login, logout, refresh, me)
 *  - Leads CRUD + statuts + tags + assignation + historique + scoring + export
 *  - Import CSV/XLSX (CRM-021 → CRM-027)
 *  - Admin : stats, scoring-weights, users CRUD
 */
import {
  OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { createLeadSchema, leadStatus, listLeadsQuery, updateLeadSchema, changeStatusSchema, assignLeadSchema, setTagsSchema } from "./schemas/lead";
import { loginSchema } from "./schemas/auth";
import { startImportSchema, scoringWeightsSchema } from "./schemas/import";

extendZodWithOpenApi(z);

const COOKIE_AUTH = "cookieAuth";

export function buildOpenApiDocument() {
  const r = new OpenAPIRegistry();

  r.registerComponent("securitySchemes", COOKIE_AUTH, {
    type: "apiKey", in: "cookie", name: "crm_at",
  });

  // ── Common schemas ─────────────────────────────────────────────────────────
  const LeadDTO = r.register("Lead", z.object({
    id: z.string(), email: z.string().email().nullable(), phone: z.string().nullable(),
    firstName: z.string().nullable(), lastName: z.string().nullable(), company: z.string().nullable(),
    website: z.string().nullable(), sector: z.string().nullable(), city: z.string().nullable(),
    country: z.string().nullable(), source: z.string().nullable(), status: leadStatus,
    emailStatus: z.string(), score: z.number().int(), tags: z.array(z.string()), notes: z.string().nullable(),
    assignedToId: z.string().nullable(), pipelineStageId: z.string().nullable(),
    lastActionAt: z.string().datetime().nullable(), lastReplyAt: z.string().datetime().nullable(),
    deletedAt: z.string().datetime().nullable(), createdAt: z.string().datetime(), updatedAt: z.string().datetime(),
  }));
  const Paginated = r.register("PaginatedLeads", z.object({
    data: z.array(LeadDTO),
    pagination: z.object({ page: z.number(), pageSize: z.number(), total: z.number(), totalPages: z.number() }),
  }));
  const ErrorResp = r.register("Error", z.object({ error: z.string(), message: z.string(), details: z.any().optional() }));

  const ImportJobDTO = r.register("ImportJob", z.object({
    id: z.string(), userId: z.string(), fileName: z.string(), status: z.string(),
    totalRows: z.number().int(), importedRows: z.number().int(),
    duplicateRows: z.number().int(), errorRows: z.number().int(),
    errorReport: z.string().nullable(), mapping: z.any().nullable(),
    createdAt: z.string().datetime(),
  }));

  const UserDTO = r.register("User", z.object({
    id: z.string(), name: z.string(), email: z.string().email(),
    role: z.enum(["ADMIN", "MANAGER", "COMMERCIAL", "LECTEUR"]),
    isActive: z.boolean(), lastLoginAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
  }));

  const idParam = z.object({ id: z.string() });
  const sec = [{ [COOKIE_AUTH]: [] }];

  // ── Auth ───────────────────────────────────────────────────────────────────
  r.registerPath({
    method: "post", path: "/api/auth/login", tags: ["Auth"], summary: "Connexion email/mot de passe (+ TOTP)",
    request: { body: { content: { "application/json": { schema: loginSchema } } } },
    responses: {
      200: { description: "Connecté (cookies crm_at / crm_rt posés)" },
      401: { description: "Identifiants invalides", content: { "application/json": { schema: ErrorResp } } },
    },
  });
  r.registerPath({ method: "post", path: "/api/auth/logout", tags: ["Auth"], summary: "Déconnexion", security: sec, responses: { 204: { description: "Déconnecté" } } });
  r.registerPath({ method: "post", path: "/api/auth/refresh", tags: ["Auth"], summary: "Rafraîchir l'access token", responses: { 200: { description: "Nouveaux cookies" }, 401: { description: "Session expirée", content: { "application/json": { schema: ErrorResp } } } } });
  r.registerPath({ method: "get", path: "/api/auth/me", tags: ["Auth"], summary: "Utilisateur courant", security: sec, responses: { 200: { description: "Profil + permissions" }, 401: { description: "Non authentifié", content: { "application/json": { schema: ErrorResp } } } } });

  // ── Leads ──────────────────────────────────────────────────────────────────
  r.registerPath({
    method: "get", path: "/api/leads", tags: ["Leads"], summary: "Listing paginé des leads",
    security: sec, request: { query: listLeadsQuery },
    responses: { 200: { description: "Page de leads", content: { "application/json": { schema: Paginated } } } },
  });
  r.registerPath({
    method: "post", path: "/api/leads", tags: ["Leads"], summary: "Créer un lead",
    security: sec, request: { body: { content: { "application/json": { schema: createLeadSchema } } } },
    responses: { 201: { description: "Lead créé", content: { "application/json": { schema: LeadDTO } } }, 409: { description: "Email déjà présent", content: { "application/json": { schema: ErrorResp } } } },
  });
  r.registerPath({ method: "get", path: "/api/leads/{id}", tags: ["Leads"], summary: "Fiche lead", security: sec, request: { params: idParam }, responses: { 200: { description: "Lead + historique", content: { "application/json": { schema: z.object({ lead: LeadDTO, history: z.array(z.any()) }) } } }, 404: { description: "Introuvable", content: { "application/json": { schema: ErrorResp } } } } });
  r.registerPath({ method: "put", path: "/api/leads/{id}", tags: ["Leads"], summary: "Éditer un lead", security: sec, request: { params: idParam, body: { content: { "application/json": { schema: updateLeadSchema } } } }, responses: { 200: { description: "Lead mis à jour", content: { "application/json": { schema: LeadDTO } } } } });
  r.registerPath({ method: "delete", path: "/api/leads/{id}", tags: ["Leads"], summary: "Supprimer (soft) un lead", security: sec, request: { params: idParam }, responses: { 204: { description: "Supprimé" } } });
  r.registerPath({ method: "post", path: "/api/leads/{id}/restore", tags: ["Leads"], summary: "Restaurer un lead archivé", security: sec, request: { params: idParam }, responses: { 200: { description: "Lead restauré", content: { "application/json": { schema: LeadDTO } } } } });
  r.registerPath({ method: "post", path: "/api/leads/{id}/status", tags: ["Leads"], summary: "Changer le statut (transitions validées)", security: sec, request: { params: idParam, body: { content: { "application/json": { schema: changeStatusSchema } } } }, responses: { 200: { description: "Statut modifié", content: { "application/json": { schema: LeadDTO } } }, 409: { description: "Transition interdite", content: { "application/json": { schema: ErrorResp } } } } });
  r.registerPath({ method: "post", path: "/api/leads/{id}/assign", tags: ["Leads"], summary: "Assigner / désassigner un lead", security: sec, request: { params: idParam, body: { content: { "application/json": { schema: assignLeadSchema } } } }, responses: { 200: { description: "Lead assigné", content: { "application/json": { schema: LeadDTO } } } } });
  r.registerPath({ method: "put", path: "/api/leads/{id}/tags", tags: ["Leads"], summary: "Remplacer les tags d'un lead", security: sec, request: { params: idParam, body: { content: { "application/json": { schema: setTagsSchema } } } }, responses: { 200: { description: "Tags mis à jour", content: { "application/json": { schema: LeadDTO } } } } });
  r.registerPath({ method: "get", path: "/api/leads/{id}/history", tags: ["Leads"], summary: "Historique d'un lead", security: sec, request: { params: idParam }, responses: { 200: { description: "Entrées d'historique" } } });
  r.registerPath({ method: "post", path: "/api/leads/{id}/recalculate-score", tags: ["Leads"], summary: "Recalculer le score d'un lead", security: sec, request: { params: idParam }, responses: { 200: { description: "Score recalculé" } } });
  r.registerPath({
    method: "get", path: "/api/leads/export", tags: ["Leads"], summary: "Export CSV / XLSX",
    security: sec,
    request: { query: z.object({ format: z.enum(["csv", "xlsx"]).optional(), columns: z.string().optional() }).merge(listLeadsQuery.partial()) },
    responses: { 200: { description: "Fichier téléchargeable" } },
  });

  // ── Import ─────────────────────────────────────────────────────────────────
  r.registerPath({
    method: "post", path: "/api/import", tags: ["Import"], summary: "Upload CSV/XLSX — crée l'ImportJob",
    security: sec,
    request: { body: { content: { "multipart/form-data": { schema: z.object({ file: z.any() }) } } } },
    responses: {
      201: { description: "Import créé avec headers + aperçu", content: { "application/json": { schema: z.object({ data: z.object({ id: z.string(), fileName: z.string(), headers: z.array(z.string()), previewRows: z.array(z.any()), totalRows: z.number() }) }) } } },
      400: { description: "Format invalide", content: { "application/json": { schema: ErrorResp } } },
    },
  });
  r.registerPath({
    method: "get", path: "/api/import", tags: ["Import"], summary: "Liste des imports",
    security: sec,
    responses: { 200: { description: "Historique d'imports", content: { "application/json": { schema: z.object({ data: z.array(ImportJobDTO) }) } } } },
  });
  r.registerPath({
    method: "get", path: "/api/import/{id}", tags: ["Import"], summary: "Statut d'un import (polling)",
    security: sec, request: { params: idParam },
    responses: { 200: { description: "ImportJob", content: { "application/json": { schema: z.object({ data: ImportJobDTO }) } } }, 404: { description: "Introuvable", content: { "application/json": { schema: ErrorResp } } } },
  });
  r.registerPath({
    method: "delete", path: "/api/import/{id}", tags: ["Import"], summary: "Supprimer un import et son fichier",
    security: sec, request: { params: idParam },
    responses: { 204: { description: "Supprimé" }, 409: { description: "Import en cours", content: { "application/json": { schema: ErrorResp } } } },
  });
  r.registerPath({
    method: "post", path: "/api/import/{id}/start", tags: ["Import"], summary: "Confirmer le mapping et lancer le traitement",
    security: sec, request: { params: idParam, body: { content: { "application/json": { schema: startImportSchema } } } },
    responses: {
      200: { description: "Import démarré", content: { "application/json": { schema: z.object({ data: ImportJobDTO }) } } },
      409: { description: "Import déjà en cours ou terminé", content: { "application/json": { schema: ErrorResp } } },
    },
  });

  // ── Admin ──────────────────────────────────────────────────────────────────
  r.registerPath({
    method: "get", path: "/api/admin/stats", tags: ["Admin"], summary: "KPIs du tableau de bord (Admin/Manager)",
    security: sec,
    responses: { 200: { description: "Statistiques globales" } },
  });
  r.registerPath({
    method: "get", path: "/api/admin/scoring-weights", tags: ["Admin"], summary: "Poids de scoring actuels (Admin/Manager)",
    security: sec,
    responses: { 200: { description: "ScoringWeights", content: { "application/json": { schema: z.object({ data: scoringWeightsSchema }) } } } },
  });
  r.registerPath({
    method: "put", path: "/api/admin/scoring-weights", tags: ["Admin"], summary: "Mettre à jour les poids de scoring (Admin)",
    security: sec, request: { body: { content: { "application/json": { schema: scoringWeightsSchema } } } },
    responses: { 200: { description: "Poids enregistrés" } },
  });

  // ── Users ──────────────────────────────────────────────────────────────────
  r.registerPath({
    method: "get", path: "/api/users", tags: ["Users"], summary: "Liste des utilisateurs",
    security: sec,
    request: { query: z.object({ all: z.enum(["true", "false"]).optional() }) },
    responses: { 200: { description: "Utilisateurs", content: { "application/json": { schema: z.object({ data: z.array(UserDTO) }) } } } },
  });
  r.registerPath({
    method: "post", path: "/api/users", tags: ["Users"], summary: "Créer un utilisateur (Admin)",
    security: sec,
    request: { body: { content: { "application/json": { schema: z.object({ name: z.string(), email: z.string().email(), password: z.string().min(8), role: z.enum(["ADMIN", "MANAGER", "COMMERCIAL", "LECTEUR"]).optional() }) } } } },
    responses: { 201: { description: "Utilisateur créé", content: { "application/json": { schema: z.object({ data: UserDTO }) } } }, 409: { description: "Email déjà utilisé", content: { "application/json": { schema: ErrorResp } } } },
  });
  r.registerPath({
    method: "get", path: "/api/users/{id}", tags: ["Users"], summary: "Détail d'un utilisateur (Admin)",
    security: sec, request: { params: idParam },
    responses: { 200: { description: "Utilisateur", content: { "application/json": { schema: z.object({ data: UserDTO }) } } }, 404: { description: "Introuvable", content: { "application/json": { schema: ErrorResp } } } },
  });
  r.registerPath({
    method: "put", path: "/api/users/{id}", tags: ["Users"], summary: "Modifier un utilisateur (Admin)",
    security: sec, request: { params: idParam, body: { content: { "application/json": { schema: z.object({ name: z.string().optional(), role: z.enum(["ADMIN", "MANAGER", "COMMERCIAL", "LECTEUR"]).optional(), isActive: z.boolean().optional() }) } } } },
    responses: { 200: { description: "Utilisateur mis à jour", content: { "application/json": { schema: z.object({ data: UserDTO }) } } } },
  });
  r.registerPath({
    method: "delete", path: "/api/users/{id}", tags: ["Users"], summary: "Désactiver un utilisateur (Admin)",
    security: sec, request: { params: idParam },
    responses: { 200: { description: "Utilisateur désactivé" } },
  });

  return new OpenApiGeneratorV31(r.definitions).generateDocument({
    openapi: "3.1.0",
    info: {
      title: "CRM Lead Dashboard API",
      version: "0.2.0",
      description: "API REST du CRM — modules : Auth · Leads · Import CSV/XLSX · Administration",
    },
    servers: [{ url: process.env.APP_BASE_URL ?? "http://localhost:3000" }],
  });
}
