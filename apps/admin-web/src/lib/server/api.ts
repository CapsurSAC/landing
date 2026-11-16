import 'server-only';
import {
  AdminComplaintSchema,
  AdminLeadListResponseSchema,
  AdminLeadSchema,
  AdminPrivacyRequestSchema,
  AdminPromotionListResponseSchema,
  AdminPromotionSchema,
  AdminSpecialtyInputSchema,
  AuditEntrySchema,
  DailyReportSchema,
  FunnelReportSchema,
  HealthSchema,
  IntegrationSummarySchema,
  type AdminPromotionInput,
  type AdminSpecialtyInput,
  type AuditEntry,
  type Health,
} from '@capsur/api-contracts';
import { z } from 'zod';
import { toServiceQuery, type LeadFilters } from '../lead-filters';
import { brand } from './env';
import { callService, fetchService, type ServiceName, type ServiceResult } from './services';

/**
 * Funciones por endpoint (docs/architecture/v2-integration-spec.md §3). Las
 * listas cuyo envoltorio no fija el contrato aceptan `{ items }` o un array.
 */

const itemsOf = <T extends z.ZodType>(item: T) =>
  z
    .union([
      z.object({
        items: z.array(item),
        page: z.number().int().optional(),
        pageSize: z.number().int().optional(),
        total: z.number().int().optional(),
      }),
      z.array(item),
    ])
    .transform((v) => (Array.isArray(v) ? { items: v, total: v.length } : { ...v, total: v.total ?? v.items.length }));

const anyBody = z.unknown();

/* ------------------------------- promociones ------------------------------ */

export const listPromotions = (actor: string) =>
  callService('promotions', '/internal/admin/promotions', AdminPromotionListResponseSchema, {
    query: { brand: brand() },
    actor,
  });

export const createPromotion = (input: AdminPromotionInput, actor: string) =>
  callService('promotions', '/internal/admin/promotions', AdminPromotionSchema, { method: 'POST', body: input, actor });

export const updatePromotion = (id: string, input: AdminPromotionInput, actor: string) =>
  callService('promotions', `/internal/admin/promotions/${encodeURIComponent(id)}`, AdminPromotionSchema, {
    method: 'PUT',
    body: input,
    actor,
  });

export const deactivatePromotion = (id: string, actor: string) =>
  callService('promotions', `/internal/admin/promotions/${encodeURIComponent(id)}/deactivate`, anyBody, {
    method: 'POST',
    body: {},
    actor,
  });

export const listSpecialties = (actor: string) =>
  callService('promotions', '/internal/admin/specialties', itemsOf(AdminSpecialtyInputSchema), {
    query: { brand: brand() },
    actor,
  });

export const updateSpecialty = (id: string, input: AdminSpecialtyInput, actor: string) =>
  callService('promotions', `/internal/admin/specialties/${encodeURIComponent(id)}`, anyBody, {
    method: 'PUT',
    body: input,
    actor,
  });

/* ---------------------------------- leads --------------------------------- */

export const listLeads = (filters: LeadFilters, actor: string) =>
  callService('leads', '/internal/admin/leads', AdminLeadListResponseSchema, {
    query: toServiceQuery(filters, brand()),
    actor,
  });

export const exportLeadsCsv = (filters: LeadFilters, actor: string) =>
  fetchService('leads', '/internal/admin/leads.csv', {
    query: toServiceQuery(filters, brand(), { paginate: false }),
    actor,
    accept: 'text/csv',
    timeoutMs: 60_000,
  });

export const getLead = (leadId: string, actor: string) =>
  callService('leads', `/internal/admin/leads/${encodeURIComponent(leadId)}`, AdminLeadSchema, { actor });

export const anonymizeLead = (leadId: string, deleteCrmContact: boolean, actor: string) =>
  callService('leads', `/internal/admin/leads/${encodeURIComponent(leadId)}/anonymize`, anyBody, {
    method: 'POST',
    body: { deleteCrmContact },
    actor,
  });

/* ------------------------- reclamaciones y ARCO --------------------------- */

export const listComplaints = (q: { status?: string; page: number; pageSize: number }, actor: string) =>
  callService('leads', '/internal/admin/complaints', itemsOf(AdminComplaintSchema), {
    query: { brand: brand(), status: q.status, page: q.page, pageSize: q.pageSize },
    actor,
  });

/**
 * El contrato no define GET por id: se recorre la lista paginada (máx. 2 000
 * registros) hasta encontrarla. Suficiente para el volumen esperado.
 */
export async function findComplaint(complaintId: string, actor: string) {
  for (let page = 1; page <= 20; page++) {
    const result = await listComplaints({ page, pageSize: 100 }, actor);
    if (!result.ok) return result;
    const found = result.data.items.find((c) => c.complaintId === complaintId);
    if (found) return { ok: true as const, data: found };
    if (result.data.items.length < 100 || page * 100 >= result.data.total) break;
  }
  return { ok: true as const, data: null };
}

export const respondComplaint =(complaintId: string, response: string, actor: string) =>
  callService('leads', `/internal/admin/complaints/${encodeURIComponent(complaintId)}/response`, anyBody, {
    method: 'POST',
    body: { response },
    actor,
  });

export const listPrivacyRequests = (q: { status?: string; page?: number; pageSize?: number }, actor: string) =>
  callService('leads', '/internal/admin/privacy-requests', itemsOf(AdminPrivacyRequestSchema), {
    query: { brand: brand(), status: q.status, page: q.page, pageSize: q.pageSize },
    actor,
  });

export async function findPrivacyRequest(requestId: string, actor: string) {
  for (let page = 1; page <= 20; page++) {
    const result = await listPrivacyRequests({ page, pageSize: 100 }, actor);
    if (!result.ok) return result;
    const found = result.data.items.find((r) => r.requestId === requestId);
    if (found) return { ok: true as const, data: found };
    if (result.data.items.length < 100 || page * 100 >= result.data.total) break;
  }
  return { ok: true as const, data: null };
}

export const resolvePrivacyRequest = (
  requestId: string,
  input: { status: 'in_progress' | 'resolved' | 'rejected'; resolution: string; anonymizeLeads: boolean },
  actor: string,
) =>
  callService('leads', `/internal/admin/privacy-requests/${encodeURIComponent(requestId)}/resolution`, anyBody, {
    method: 'POST',
    body: input,
    actor,
  });

/* --------------------------------- reportes ------------------------------- */

export const funnelReport = (range: { from: string; to: string }, actor: string) =>
  callService('leads', '/internal/reports/funnel', FunnelReportSchema, {
    query: { brand: brand(), from: range.from, to: range.to },
    actor,
  });

export const dailyReport = (date: string, actor: string) =>
  callService('leads', '/internal/reports/daily', DailyReportSchema, { query: { brand: brand(), date }, actor });

/* ------------------------------ estado (A27) ------------------------------ */

export interface HealthProbe {
  service: ServiceName;
  latencyMs: number | null;
  health: Health | null;
  error: string | null;
}

/** `/internal/health` no exige token; se mide la latencia de ida y vuelta. */
export async function probeHealth(service: ServiceName): Promise<HealthProbe> {
  const started = performance.now();
  const result = await fetchService(service, '/internal/health', { auth: false, timeoutMs: 4000 });
  const latencyMs = Math.round(performance.now() - started);
  if (!result.ok) return { service, latencyMs: null, health: null, error: result.error.message };
  // Un servicio caído puede responder 503 con el cuerpo de salud: se lee igualmente.
  let body: unknown = null;
  try {
    body = await result.response.json();
  } catch {
    body = null;
  }
  const parsed = HealthSchema.safeParse(body);
  if (!parsed.success) {
    return { service, latencyMs, health: null, error: `Respuesta de salud no válida (HTTP ${result.response.status}).` };
  }
  return { service, latencyMs, health: parsed.data, error: null };
}

export const integrationSummary = (actor: string) =>
  callService('crm', '/internal/integrations/summary', IntegrationSummarySchema, { actor });

const RetryResultSchema = z.object({
  attempted: z.number().int(),
  succeeded: z.number().int(),
  failed: z.number().int(),
});
export type RetryResult = z.infer<typeof RetryResultSchema>;

export const retryIntegrations = (status: 'FAILED' | 'DEAD', actor: string) =>
  callService('crm', '/internal/integrations/retry', RetryResultSchema, { method: 'POST', body: { status }, actor });

export interface AuditRow extends AuditEntry {
  source: ServiceName;
}

/** Auditoría unificada de los tres servicios, ordenada de más reciente a más antigua. */
export async function unifiedAudit(
  actor: string,
  limit = 30,
): Promise<{ rows: AuditRow[]; errors: { service: ServiceName; message: string }[] }> {
  const services: ServiceName[] = ['promotions', 'leads', 'crm'];
  const results = await Promise.all(
    services.map((service) =>
      callService(service, '/internal/admin/audit', itemsOf(AuditEntrySchema), { query: { limit }, actor }).then(
        (r): [ServiceName, ServiceResult<{ items: AuditEntry[] }>] => [service, r],
      ),
    ),
  );
  const rows: AuditRow[] = [];
  const errors: { service: ServiceName; message: string }[] = [];
  for (const [service, result] of results) {
    if (result.ok) rows.push(...result.data.items.map((e) => ({ ...e, source: service })));
    else errors.push({ service, message: result.error.message });
  }
  rows.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return { rows: rows.slice(0, limit), errors };
}
