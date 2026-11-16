import 'server-only';
import { ACTOR_HEADER, ApiErrorSchema } from '@capsur/api-contracts';
import * as Sentry from '@sentry/nextjs';
import type { z } from 'zod';
import { SERVICE_LABEL } from '../labels';
import { serverEnv } from './env';
import { log } from './log';

/**
 * Cliente HTTP hacia los servicios internos. SOLO se ejecuta en el servidor
 * del panel: los tokens nunca llegan al navegador. Cada llamada lleva
 * `Authorization: Bearer <token>` y `x-actor: <correo>` para la auditoría, y
 * cada respuesta se valida con el esquema Zod del contrato.
 */

export type ServiceName = 'promotions' | 'leads' | 'crm';

export interface ServiceError {
  kind: 'config' | 'network' | 'timeout' | 'http' | 'invalid';
  service: ServiceName;
  status?: number;
  /** Mensaje para la persona usuaria, en español, sin datos sensibles. */
  message: string;
  /** Errores por campo devueltos por el servicio (problem+json). */
  fieldErrors?: { path: string; message: string }[];
}

export type ServiceResult<T> = { ok: true; data: T; status: number } | { ok: false; error: ServiceError };

interface CallOptions {
  method?: 'GET' | 'POST' | 'PUT';
  query?: URLSearchParams | Record<string, string | number | undefined>;
  body?: unknown;
  actor?: string | null;
  /** false para /internal/health, que no exige token. */
  auth?: boolean;
  accept?: string;
  timeoutMs?: number;
}

function baseAndToken(service: ServiceName): { base: string; token: string; tokenVar: string } {
  const env = serverEnv();
  switch (service) {
    case 'promotions':
      return { base: env.PROMOTIONS_SERVICE_URL, token: env.PROMOTIONS_SERVICE_TOKEN, tokenVar: 'PROMOTIONS_SERVICE_TOKEN' };
    case 'leads':
      return { base: env.LEADS_SERVICE_URL, token: env.LEADS_SERVICE_TOKEN, tokenVar: 'LEADS_SERVICE_TOKEN' };
    case 'crm':
      return { base: env.CRM_BRIDGE_SERVICE_URL, token: env.CRM_BRIDGE_SERVICE_TOKEN, tokenVar: 'CRM_BRIDGE_SERVICE_TOKEN' };
  }
}

function buildUrl(base: string, path: string, query: CallOptions['query']): string {
  const url = new URL(path, `${base.replace(/\/+$/, '')}/`);
  if (query instanceof URLSearchParams) {
    query.forEach((v, k) => url.searchParams.append(k, v));
  } else if (query) {
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }
  return url.toString();
}

function report(error: ServiceError, path: string): void {
  // Ruta sin query (los filtros pueden contener correos o teléfonos buscados).
  log(error.kind === 'http' && (error.status ?? 0) < 500 ? 'warn' : 'error', 'service_call_failed', {
    service: error.service,
    path,
    kind: error.kind,
    status: error.status,
  });
  if (error.kind === 'invalid' || error.kind === 'config' || (error.status ?? 0) >= 500) {
    Sentry.captureMessage(`admin-web: ${error.service} ${error.kind}`, {
      level: 'warning',
      tags: { service: error.service, kind: error.kind, status: String(error.status ?? '') },
      extra: { path },
    });
  }
}

function httpMessage(service: ServiceName, status: number, tokenVar: string, detail?: string): string {
  const name = SERVICE_LABEL[service];
  if (status === 401 || status === 403) return `${name} rechazó la credencial del panel (${status}). Revisa ${tokenVar}.`;
  if (status === 404) return detail ?? 'No se encontró el registro solicitado.';
  if (status === 409) return detail ?? 'El registro ya existe o entró en conflicto con otro cambio.';
  if (status === 400 || status === 422) return detail ?? `${name} rechazó los datos enviados.`;
  if (status === 429) return `${name} está limitando las peticiones. Espera un momento y vuelve a intentar.`;
  return `${name} respondió con un error (${status}). Inténtalo de nuevo en unos minutos.`;
}

/** Llamada de bajo nivel: devuelve la `Response` (para transmitir el CSV sin cargarlo en memoria). */
export async function fetchService(
  service: ServiceName,
  path: string,
  options: CallOptions = {},
): Promise<{ ok: true; response: Response } | { ok: false; error: ServiceError }> {
  let target: ReturnType<typeof baseAndToken>;
  try {
    target = baseAndToken(service);
  } catch (err) {
    const error: ServiceError = { kind: 'config', service, message: (err as Error).message };
    report(error, path);
    return { ok: false, error };
  }
  const useAuth = options.auth !== false;
  if (useAuth && !target.token) {
    const error: ServiceError = {
      kind: 'config',
      service,
      message: `Falta ${target.tokenVar}: el panel no puede autenticarse ante ${SERVICE_LABEL[service]}.`,
    };
    report(error, path);
    return { ok: false, error };
  }

  const headers: Record<string, string> = { accept: options.accept ?? 'application/json' };
  if (useAuth) headers.authorization = `Bearer ${target.token}`;
  if (options.actor) headers[ACTOR_HEADER] = options.actor;
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  try {
    const response = await fetch(buildUrl(target.base, path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(options.timeoutMs ?? serverEnv().SERVICE_TIMEOUT_MS),
    });
    return { ok: true, response };
  } catch (err) {
    const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    const error: ServiceError = timeout
      ? { kind: 'timeout', service, message: `${SERVICE_LABEL[service]} no respondió a tiempo.` }
      : {
          kind: 'network',
          service,
          message: `No se pudo conectar con ${SERVICE_LABEL[service]}. Comprueba que el servicio esté en marcha.`,
        };
    report(error, path);
    return { ok: false, error };
  }
}

/** Convierte una respuesta de error en `ServiceError` leyendo problem+json si lo hay. */
export async function errorFromResponse(service: ServiceName, path: string, response: Response): Promise<ServiceError> {
  let detail: string | undefined;
  let fieldErrors: ServiceError['fieldErrors'];
  try {
    const problem = ApiErrorSchema.safeParse(await response.json());
    if (problem.success) {
      detail = problem.data.detail ?? problem.data.title;
      fieldErrors = problem.data.errors;
    }
  } catch {
    // cuerpo vacío o no JSON
  }
  const error: ServiceError = {
    kind: 'http',
    service,
    status: response.status,
    message: httpMessage(service, response.status, baseAndToken(service).tokenVar, detail),
    ...(fieldErrors ? { fieldErrors } : {}),
  };
  report(error, path);
  return error;
}

/** Llamada JSON validada con el esquema del contrato. */
export async function callService<S extends z.ZodType>(
  service: ServiceName,
  path: string,
  schema: S,
  options: CallOptions = {},
): Promise<ServiceResult<z.infer<S>>> {
  const result = await fetchService(service, path, options);
  if (!result.ok) return result;
  const { response } = result;
  if (!response.ok) return { ok: false, error: await errorFromResponse(service, path, response) };

  let body: unknown = null;
  if (response.status !== 204) {
    const text = await response.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = undefined;
      }
    }
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const error: ServiceError = {
      kind: 'invalid',
      service,
      status: response.status,
      message: `La respuesta de ${SERVICE_LABEL[service]} no cumple el contrato esperado. Avisa al equipo técnico.`,
    };
    // Solo rutas y mensajes de Zod (sin valores): no filtra datos personales.
    log('error', 'service_contract_mismatch', {
      service,
      path,
      issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    report(error, path);
    return { ok: false, error };
  }
  return { ok: true, data: parsed.data, status: response.status };
}
