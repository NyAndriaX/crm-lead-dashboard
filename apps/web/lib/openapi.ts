/**
 * Spécification OpenAPI 3.1 — CRM-008.
 * Construite à partir des schémas Zod (zod-to-openapi). Servie en JSON sur
 * /api/openapi.json (Admin) et via Swagger UI sur /api/docs (Admin).
 *
 * NOTE : seuls les endpoints du socle (auth + leads) sont décrits ici ;
 * les modules suivants enrichiront ce registre au fil des tickets.
 */
import {
  OpenAPIRegistry, OpenApiGeneratorV31, extendZodWithOpenApi,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { createLeadSchema, leadStatus, listLeadsQuery, updateLeadSchema } from "./schemas/lead";
import { loginSchema } from "./schemas/auth";

extendZodWithOpenApi(z);

const COOKIE_AUTH = "cookieAuth";

export function buildOpenApiDocument() {
  const r = new OpenAPIRegistry();

  r.registerComponent("securitySchemes", COOKIE_AUTH, {
    type: "apiKey", in: "cookie", name: "crm_at",
  });

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

  // --- auth ---
  r.registerPath({
    method: "post", path: "/api/auth/login", tags: ["Auth"], summary: "Connexion email/mot de passe (+ TOTP)",
    request: { body: { content: { "application/json": { schema: loginSchema } } } },
    responses: {
      200: { description: "Connecté (cookies crm_at / crm_rt posés)" },
      401: { description: "Identifiants invalides ou 2FA requis/incorrect", content: { "application/json": { schema: ErrorResp } } },
    },
  });
  r.registerPath({ method: "post", path: "/api/auth/logout", tags: ["Auth"], summary: "Déconnexion", security: [{ [COOKIE_AUTH]: [] }], responses: { 204: { description: "Déconnecté" } } });
  r.registerPath({ method: "post", path: "/api/auth/refresh", tags: ["Auth"], summary: "Rafraîchir l'access token", responses: { 200: { description: "Nouveaux cookies" }, 401: { description: "Session expirée", content: { "application/json": { schema: ErrorResp } } } } });
  r.registerPath({ method: "get", path: "/api/auth/me", tags: ["Auth"], summary: "Utilisateur courant", security: [{ [COOKIE_AUTH]: [] }], responses: { 200: { description: "Profil + permissions" }, 401: { description: "Non authentifié", content: { "application/json": { schema: ErrorResp } } } } });

  // --- leads ---
  r.registerPath({
    method: "get", path: "/api/leads", tags: ["Leads"], summary: "Listing paginé des leads",
    security: [{ [COOKIE_AUTH]: [] }],
    request: { query: listLeadsQuery },
    responses: { 200: { description: "Page de leads", content: { "application/json": { schema: Paginated } } } },
  });
  r.registerPath({
    method: "post", path: "/api/leads", tags: ["Leads"], summary: "Créer un lead",
    security: [{ [COOKIE_AUTH]: [] }],
    request: { body: { content: { "application/json": { schema: createLeadSchema } } } },
    responses: { 201: { description: "Lead créé", content: { "application/json": { schema: LeadDTO } } }, 409: { description: "Email déjà présent", content: { "application/json": { schema: ErrorResp } } } },
  });
  const idParam = z.object({ id: z.string() });
  r.registerPath({ method: "get", path: "/api/leads/{id}", tags: ["Leads"], summary: "Fiche lead", security: [{ [COOKIE_AUTH]: [] }], request: { params: idParam }, responses: { 200: { description: "Lead", content: { "application/json": { schema: LeadDTO } } }, 404: { description: "Introuvable", content: { "application/json": { schema: ErrorResp } } } } });
  r.registerPath({ method: "put", path: "/api/leads/{id}", tags: ["Leads"], summary: "Éditer un lead", security: [{ [COOKIE_AUTH]: [] }], request: { params: idParam, body: { content: { "application/json": { schema: updateLeadSchema } } } }, responses: { 200: { description: "Lead mis à jour", content: { "application/json": { schema: LeadDTO } } } } });
  r.registerPath({ method: "delete", path: "/api/leads/{id}", tags: ["Leads"], summary: "Supprimer (soft) un lead", security: [{ [COOKIE_AUTH]: [] }], request: { params: idParam }, responses: { 204: { description: "Supprimé" } } });
  r.registerPath({ method: "post", path: "/api/leads/{id}/restore", tags: ["Leads"], summary: "Restaurer un lead", security: [{ [COOKIE_AUTH]: [] }], request: { params: idParam }, responses: { 200: { description: "Lead restauré", content: { "application/json": { schema: LeadDTO } } } } });

  return new OpenApiGeneratorV31(r.definitions).generateDocument({
    openapi: "3.1.0",
    info: { title: "CRM Lead Dashboard API", version: "0.1.0", description: "API REST du CRM (socle : Auth + Leads). Documentation enrichie au fil des modules." },
    servers: [{ url: process.env.APP_BASE_URL ?? "http://localhost:3000" }],
  });
}
