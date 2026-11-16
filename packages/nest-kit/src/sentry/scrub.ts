import { REDACTED, redactDeep, scrubText, SENSITIVE_HEADER_NAMES } from '../logging/redaction';

/**
 * Forma mínima de un evento de Sentry que limpia {@link scrubSentryEvent}.
 * Se tipa de forma estructural para no cargar Sentry en las pruebas.
 */
export interface SentryEventLike {
  message?: string;
  request?: {
    data?: unknown;
    cookies?: unknown;
    headers?: Record<string, string>;
    query_string?: unknown;
    [key: string]: unknown;
  };
  user?: Record<string, unknown>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, unknown>;
  tags?: Record<string, unknown>;
  breadcrumbs?: Array<{ message?: string; data?: Record<string, unknown>; [key: string]: unknown }>;
  exception?: { values?: Array<{ value?: string; [key: string]: unknown }> };
  [key: string]: unknown;
}

const SENSITIVE_HEADERS = new Set<string>(SENSITIVE_HEADER_NAMES);

/**
 * `beforeSend` de Sentry (C23): elimina `request.data`, cookies y query
 * string, quita cabeceras sensibles, deja del usuario solo el `id`, aplica la
 * misma redacción que los logs a `extra`, `contexts`, `tags` y breadcrumbs y
 * sustituye correos/teléfonos en mensajes de error.
 */
export function scrubSentryEvent<T extends object>(input: T): T {
  // Acceso estructural: el tipo real de Sentry (`ErrorEvent`) no declara índice de cadena.
  const event = input as unknown as SentryEventLike;
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.headers) {
      const headers: Record<string, string> = {};
      for (const [name, value] of Object.entries(event.request.headers)) {
        if (!SENSITIVE_HEADERS.has(name.toLowerCase())) {
          headers[name] = value;
        }
      }
      event.request.headers = headers;
    }
  }
  if (event.user) {
    const id = event.user.id;
    event.user = id === undefined ? {} : { id };
  }
  if (event.extra) {
    event.extra = redactDeep(event.extra);
  }
  if (event.contexts) {
    event.contexts = redactDeep(event.contexts);
  }
  if (event.tags) {
    event.tags = redactDeep(event.tags);
  }
  if (typeof event.message === 'string') {
    event.message = scrubText(event.message);
  }
  if (event.exception?.values) {
    for (const value of event.exception.values) {
      if (typeof value.value === 'string') {
        value.value = scrubText(value.value);
      }
    }
  }
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((crumb) => {
      const copy = { ...crumb };
      if (copy.data) {
        copy.data = redactDeep(copy.data);
      }
      if (typeof copy.message === 'string') {
        copy.message = scrubText(copy.message);
      }
      return copy;
    });
  }
  return input;
}

export { REDACTED };
