/**
 * Limpieza de datos personales antes de enviar un evento a Sentry (C23).
 * Sin dependencias de Sentry para poder probarla y usarla en cliente y servidor.
 */

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Secuencias de 7+ dígitos (teléfonos, documentos), con espacios o guiones opcionales.
const LONG_NUMBER = /\+?\d(?:[\s-]?\d){6,}/g;
const LEAD_TOKEN = /(token=)[A-Za-z0-9_-]+/gi;

export function scrubText(value: string): string {
  return value.replace(EMAIL, '[correo]').replace(LONG_NUMBER, '[número]').replace(LEAD_TOKEN, '$1[token]');
}

type Mutable = Record<string, unknown>;

function scrubUrl(url: unknown): unknown {
  if (typeof url !== 'string') return url;
  // Se descartan query y fragmento: pueden llevar UTM con datos o el token de estado.
  return scrubText(url.split(/[?#]/)[0] ?? url);
}

/** Muta y devuelve el evento sin usuario, cookies, cabeceras sensibles, cuerpos ni PII en textos. */
export function scrubEvent<T>(event: T): T {
  const e = event as unknown as Mutable;
  delete e.user;
  if (e.request && typeof e.request === 'object') {
    const req = e.request as Mutable;
    delete req.cookies;
    delete req.data;
    delete req.query_string;
    req.url = scrubUrl(req.url);
    if (req.headers && typeof req.headers === 'object') {
      const headers = req.headers as Mutable;
      for (const key of Object.keys(headers)) {
        if (/authorization|cookie|x-lead-token|idempotency-key|x-forwarded-for|x-real-ip/i.test(key)) delete headers[key];
      }
    }
  }
  if (typeof e.message === 'string') e.message = scrubText(e.message);
  const exception = e.exception as { values?: Array<Mutable> } | undefined;
  for (const value of exception?.values ?? []) {
    if (typeof value.value === 'string') value.value = scrubText(value.value);
  }
  const breadcrumbs = e.breadcrumbs as Array<Mutable> | undefined;
  for (const crumb of breadcrumbs ?? []) {
    if (typeof crumb.message === 'string') crumb.message = scrubText(crumb.message);
    if (crumb.data && typeof crumb.data === 'object') {
      const data = crumb.data as Mutable;
      if ('url' in data) data.url = scrubUrl(data.url);
      delete data.body;
    }
  }
  return event;
}
