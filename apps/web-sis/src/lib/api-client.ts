/**
 * Único punto de acceso HTTP de la web (navegador y servidor Next).
 *
 * B3: este módulo se carga en el navegador, así que NO importa valores de
 * `@capsur/api-contracts` (el paquete es CommonJS y arrastraría Zod completo
 * al bundle). Solo usa `import type` y valida las respuestas con comprobaciones
 * mínimas escritas a mano; la validación completa la hace siempre el backend.
 *
 * Nota para la migración a un cliente generado desde OpenAPI (B13): mantener
 * las firmas exportadas para no tocar los componentes.
 */
import type {
  ApiError as ApiProblem,
  Campus,
  ComplaintInput,
  ComplaintResponse,
  CreateLeadInput,
  CreateLeadResponse,
  LeadFeedbackRequest,
  LeadStatus,
  LeadStatusResponse,
  PrivacyRequestInput,
  PrivacyRequestResponse,
  TrackingEventRequest,
} from '@capsur/api-contracts';
import { siteConfig } from './config';

/** Debe coincidir con LEAD_TOKEN_HEADER de @capsur/api-contracts (lo comprueba una prueba). */
export const LEAD_TOKEN_HEADER = 'x-lead-token';

/* ------------------------------------------------------------------------ */
/* Errores                                                                   */
/* ------------------------------------------------------------------------ */

export class ApiRequestError extends Error {
  readonly status: number;
  readonly problem: ApiProblem | null;

  constructor(status: number, problem: ApiProblem | null) {
    super(problem?.detail ?? problem?.title ?? `Error ${status}`);
    this.name = 'ApiRequestError';
    this.status = status;
    this.problem = problem;
  }

  get code(): string | undefined {
    return this.problem?.code;
  }

  /**
   * Errores de validación por campo. La clave es la ruta completa
   * («consumer.email») y también su primer segmento («consumer»).
   */
  get fieldErrors(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const err of this.problem?.errors ?? []) {
      const first = err.path.split('.')[0] ?? err.path;
      if (err.path && !out[err.path]) out[err.path] = err.message;
      if (first && !out[first]) out[first] = err.message;
    }
    return out;
  }
}

/** Alias histórico: los componentes del formulario lo importan con este nombre. */
export { ApiRequestError as LeadApiError };

/* ------------------------------------------------------------------------ */
/* Lectura defensiva de JSON (sin Zod)                                       */
/* ------------------------------------------------------------------------ */

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(obj: Json, key: string): string {
  const value = obj[key];
  if (typeof value !== 'string') throw new TypeError(`Respuesta inválida: falta «${key}»`);
  return value;
}

function optStr(obj: Json, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}

const LEAD_STATUSES: readonly LeadStatus[] = ['registered', 'crm_syncing', 'crm_synced', 'crm_failed'];
const CAMPUSES: readonly Campus[] = ['tacna', 'arequipa'];

function leadStatus(obj: Json): LeadStatus {
  const value = str(obj, 'status');
  if (!(LEAD_STATUSES as readonly string[]).includes(value)) throw new TypeError('Respuesta inválida: estado desconocido');
  return value as LeadStatus;
}

function parseProblem(json: unknown): ApiProblem | null {
  if (!isObject(json) || typeof json.title !== 'string' || typeof json.status !== 'number') return null;
  const errors = Array.isArray(json.errors)
    ? json.errors.filter(isObject).flatMap((e) =>
        typeof e.path === 'string' && typeof e.message === 'string' ? [{ path: e.path, message: e.message }] : [],
      )
    : undefined;
  return {
    type: optStr(json, 'type') ?? 'about:blank',
    title: json.title,
    status: json.status,
    detail: optStr(json, 'detail'),
    code: optStr(json, 'code'),
    errors,
    traceId: optStr(json, 'traceId'),
  };
}

export function parseCreateLeadResponse(json: unknown): CreateLeadResponse {
  if (!isObject(json)) throw new TypeError('Respuesta inválida');
  const promotion = isObject(json.promotion) ? json.promotion : {};
  const whatsapp = isObject(json.whatsapp) ? json.whatsapp : {};
  const campus = optStr(json, 'campus');
  const specialties = Array.isArray(json.specialties)
    ? json.specialties.filter(isObject).flatMap((s) =>
        typeof s.id === 'string' && typeof s.name === 'string' ? [{ id: s.id, name: s.name }] : [],
      )
    : [];
  const url = str(whatsapp, 'url');
  if (!/^https:\/\//.test(url)) throw new TypeError('Respuesta inválida: enlace de WhatsApp');
  return {
    leadId: str(json, 'leadId'),
    reference: str(json, 'reference'),
    status: leadStatus(json),
    phone: str(json, 'phone'),
    campus: campus && (CAMPUSES as readonly string[]).includes(campus) ? (campus as Campus) : 'tacna',
    promotion: { id: str(promotion, 'id'), name: str(promotion, 'name'), headline: optStr(promotion, 'headline') ?? '' },
    specialties,
    whatsapp: { number: str(whatsapp, 'number'), prefilledMessage: optStr(whatsapp, 'prefilledMessage') ?? '', url },
    // Si el backend aún no emite el token (despliegue escalonado), la consulta de estado responderá 404 y la UI lo tolera.
    statusToken: optStr(json, 'statusToken') ?? '',
    replayed: json.replayed === true,
  };
}

export function parseLeadStatusResponse(json: unknown): LeadStatusResponse {
  if (!isObject(json)) throw new TypeError('Respuesta inválida');
  const crm = isObject(json.crm) ? json.crm : null;
  return {
    leadId: str(json, 'leadId'),
    reference: str(json, 'reference'),
    status: leadStatus(json),
    crm: crm
      ? {
          syncedAt: optStr(crm, 'syncedAt') ?? null,
          conversationLinked: crm.conversationLinked === true,
          advisorName: optStr(crm, 'advisorName') ?? null,
        }
      : undefined,
    updatedAt: optStr(json, 'updatedAt') ?? new Date(0).toISOString(),
  };
}

function parseFiledResponse(json: unknown, idKey: 'complaintId' | 'requestId') {
  if (!isObject(json)) throw new TypeError('Respuesta inválida');
  return {
    id: str(json, idKey),
    code: str(json, 'code'),
    receivedAt: str(json, 'receivedAt'),
    responseDueBy: str(json, 'responseDueBy'),
  };
}

/* ------------------------------------------------------------------------ */
/* Transporte                                                                */
/* ------------------------------------------------------------------------ */

function apiUrl(path: string): string {
  return `${siteConfig.apiBaseUrl}${path}`;
}

async function readProblem(res: Response): Promise<ApiProblem | null> {
  try {
    return parseProblem(await res.json());
  } catch {
    return null;
  }
}

async function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

async function expectJson<T>(res: Response, parse: (json: unknown) => T): Promise<T> {
  if (!res.ok) throw new ApiRequestError(res.status, await readProblem(res));
  try {
    return parse(await res.json());
  } catch {
    throw new ApiRequestError(502, { type: 'about:blank', title: 'Respuesta inesperada del servidor', status: 502 });
  }
}

/* ------------------------------------------------------------------------ */
/* Leads                                                                     */
/* ------------------------------------------------------------------------ */

export interface SubmitLeadResult {
  response: CreateLeadResponse;
  created: boolean;
}

export async function submitLead(input: CreateLeadInput, idempotencyKey: string): Promise<SubmitLeadResult> {
  const res = await postJson('/api/v1/leads', input, { 'idempotency-key': idempotencyKey });
  if (res.status === 204) {
    // Respuesta del honeypot: no debería ocurrir con usuarios reales.
    throw new ApiRequestError(204, null);
  }
  const response = await expectJson(res, parseCreateLeadResponse);
  return { response, created: res.status === 201 };
}

/** GET /api/v1/leads/:id/status con el token firmado devuelto al registrar (C18). */
export async function fetchLeadStatus(leadId: string, statusToken: string): Promise<LeadStatusResponse> {
  const res = await fetch(apiUrl(`/api/v1/leads/${encodeURIComponent(leadId)}/status`), {
    headers: { accept: 'application/json', [LEAD_TOKEN_HEADER]: statusToken },
    cache: 'no-store',
  });
  return expectJson(res, parseLeadStatusResponse);
}

/** POST /api/v1/leads/:id/feedback — «¿Cómo nos conociste?» (A21). 409 = ya respondida. */
export async function submitLeadFeedback(leadId: string, statusToken: string, body: LeadFeedbackRequest): Promise<void> {
  const res = await postJson(`/api/v1/leads/${encodeURIComponent(leadId)}/feedback`, body, {
    [LEAD_TOKEN_HEADER]: statusToken,
  });
  if (res.ok || res.status === 409) return;
  throw new ApiRequestError(res.status, await readProblem(res));
}

/* ------------------------------------------------------------------------ */
/* Cumplimiento: libro de reclamaciones y derechos ARCO                      */
/* ------------------------------------------------------------------------ */

export async function submitComplaint(input: ComplaintInput): Promise<ComplaintResponse> {
  const res = await postJson('/api/v1/complaints', input);
  const parsed = await expectJson(res, (json) => parseFiledResponse(json, 'complaintId'));
  return { complaintId: parsed.id, code: parsed.code, receivedAt: parsed.receivedAt, responseDueBy: parsed.responseDueBy };
}

export async function submitPrivacyRequest(input: PrivacyRequestInput): Promise<PrivacyRequestResponse> {
  const res = await postJson('/api/v1/privacy/requests', input);
  const parsed = await expectJson(res, (json) => parseFiledResponse(json, 'requestId'));
  return { requestId: parsed.id, code: parsed.code, receivedAt: parsed.receivedAt, responseDueBy: parsed.responseDueBy };
}

/* ------------------------------------------------------------------------ */
/* Tracking                                                                  */
/* ------------------------------------------------------------------------ */

/** Envía un evento sin bloquear ni lanzar errores (keepalive para no perderlo al navegar). */
export function sendTrackingEvent(body: TrackingEventRequest): void {
  try {
    void fetch(apiUrl('/api/v1/tracking/events'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // sin red o bloqueado: se ignora
  }
}

/* ------------------------------------------------------------------------ */
/* Catálogo (solo servidor Next)                                             */
/* ------------------------------------------------------------------------ */

/** Etiqueta de caché del catálogo; POST /api/revalidate la invalida (B8). */
export const CATALOG_CACHE_TAG = 'catalog';
const CATALOG_REVALIDATE_SECONDS = 300;

/**
 * Lee un recurso del catálogo de promotions-service desde el servidor Next.
 * Queda en la caché de datos con la etiqueta `catalog` (5 min o hasta que
 * promotions-service pida revalidar).
 */
export async function fetchCatalogJson(path: string): Promise<unknown> {
  const base = process.env.PROMOTIONS_SERVICE_URL ?? 'http://localhost:3001';
  const res = await fetch(`${base}${path}`, {
    headers: { accept: 'application/json' },
    next: { tags: [CATALOG_CACHE_TAG], revalidate: CATALOG_REVALIDATE_SECONDS },
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error(`promotions-service respondió ${res.status}`);
  return res.json();
}
