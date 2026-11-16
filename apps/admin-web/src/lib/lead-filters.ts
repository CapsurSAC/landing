import { CampusSchema, LeadStatusSchema, SlugSchema, type Brand, type Campus, type LeadStatus } from '@capsur/api-contracts';
import { isDateOnly, limaDayEndIso, limaDayStartIso } from './dates';

/**
 * Filtros de la lista de leads. Viajan en la URL del panel (searchParams) con
 * fechas locales de Lima (YYYY-MM-DD) y se traducen a la consulta de
 * `GET /internal/admin/leads` (AdminLeadListQuerySchema) con fechas ISO UTC.
 */

export type SearchParams = Record<string, string | string[] | undefined>;

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZES = [25, 50, 100] as const;

export interface LeadFilters {
  status?: LeadStatus;
  promotionId?: string;
  campus?: Campus;
  utmCampaign?: string;
  /** Día local de Lima, YYYY-MM-DD (incluido). */
  from?: string;
  /** Día local de Lima, YYYY-MM-DD (incluido). */
  to?: string;
  q?: string;
  page: number;
  pageSize: number;
}

export function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  const trimmed = v?.trim();
  return trimmed ? trimmed : undefined;
}

function positiveInt(value: string | undefined, fallback: number, max: number): number {
  if (!value || !/^\d{1,6}$/.test(value)) return fallback;
  const n = Number(value);
  return n >= 1 ? Math.min(n, max) : fallback;
}

/** Lee los filtros de la URL descartando en silencio los valores inválidos. */
export function parseLeadFilters(sp: SearchParams): LeadFilters {
  const status = LeadStatusSchema.safeParse(first(sp.status));
  const campus = CampusSchema.safeParse(first(sp.campus));
  const promotionId = SlugSchema.safeParse(first(sp.promotionId));
  const utmCampaign = first(sp.utmCampaign);
  const q = first(sp.q);
  const from = first(sp.from);
  const to = first(sp.to);
  const pageSize = positiveInt(first(sp.pageSize), DEFAULT_PAGE_SIZE, 100);

  const filters: LeadFilters = {
    page: positiveInt(first(sp.page), 1, 100_000),
    pageSize: (PAGE_SIZES as readonly number[]).includes(pageSize) ? pageSize : DEFAULT_PAGE_SIZE,
  };
  if (status.success) filters.status = status.data;
  if (campus.success) filters.campus = campus.data;
  if (promotionId.success) filters.promotionId = promotionId.data;
  if (utmCampaign) filters.utmCampaign = utmCampaign.slice(0, 150);
  if (q) filters.q = q.slice(0, 160);
  if (from && isDateOnly(from)) filters.from = from;
  if (to && isDateOnly(to)) filters.to = to;
  // Rango invertido: se intercambia en lugar de devolver una lista vacía sin explicación.
  if (filters.from && filters.to && filters.from > filters.to) {
    [filters.from, filters.to] = [filters.to, filters.from];
  }
  return filters;
}

/** Consulta para leads-service (lista y CSV). Las fechas pasan a ISO UTC (día completo de Lima). */
export function toServiceQuery(filters: LeadFilters, brand: Brand, options: { paginate?: boolean } = {}): URLSearchParams {
  const params = new URLSearchParams();
  params.set('brand', brand);
  if (options.paginate !== false) {
    params.set('page', String(filters.page));
    params.set('pageSize', String(filters.pageSize));
  }
  if (filters.status) params.set('status', filters.status);
  if (filters.promotionId) params.set('promotionId', filters.promotionId);
  if (filters.campus) params.set('campus', filters.campus);
  if (filters.utmCampaign) params.set('utmCampaign', filters.utmCampaign);
  if (filters.from) params.set('from', limaDayStartIso(filters.from)!);
  if (filters.to) params.set('to', limaDayEndIso(filters.to)!);
  if (filters.q) params.set('q', filters.q);
  return params;
}

/**
 * Query string del propio panel (enlaces de paginación y exportación). Omite
 * los valores por defecto para que las URLs sean cortas y compartibles.
 */
export function toPanelQuery(filters: LeadFilters, overrides: Partial<LeadFilters> = {}): string {
  const merged: LeadFilters = { ...filters, ...overrides };
  const params = new URLSearchParams();
  const keys = ['status', 'promotionId', 'campus', 'utmCampaign', 'from', 'to', 'q'] as const;
  for (const key of keys) {
    const value = merged[key];
    if (value) params.set(key, value);
  }
  if (merged.page > 1) params.set('page', String(merged.page));
  if (merged.pageSize !== DEFAULT_PAGE_SIZE) params.set('pageSize', String(merged.pageSize));
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export function hasActiveFilters(filters: LeadFilters): boolean {
  return Boolean(
    filters.status || filters.promotionId || filters.campus || filters.utmCampaign || filters.from || filters.to || filters.q,
  );
}
