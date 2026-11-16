import * as Sentry from '@sentry/nestjs';
import { SENSITIVE_HEADER_NAMES } from '../logging/redaction';
import { setErrorReporter } from './error-reporter';
import { scrubSentryEvent } from './scrub';

/** Opciones de {@link initSentry}. */
export interface InitSentryOptions {
  /** Nombre del servicio (etiqueta `service` y prefijo del release). */
  service: string;
  /** Versión desplegada; el release queda como `<service>@<release>`. */
  release: string;
  /** Por defecto `process.env.SENTRY_DSN`. Vacío = Sentry desactivado. */
  dsn?: string;
  /** Por defecto `SENTRY_ENVIRONMENT` o `NODE_ENV`. */
  environment?: string;
  /** Muestreo de trazas de rendimiento. Por defecto 0 (solo errores). */
  tracesSampleRate?: number;
}

/**
 * Inicializa Sentry (C23). Debe llamarse ANTES de crear la app Nest (en un
 * `instrument.ts` importado en la primera línea de `main.ts`), importándolo
 * desde `@capsur/nest-kit/sentry` para no cargar Nest antes de tiempo.
 * Devuelve `false` si `SENTRY_DSN` está vacío (desactivado).
 *
 * @example
 * // src/instrument.ts
 * import { initSentry } from '@capsur/nest-kit/sentry';
 * initSentry({ service: 'leads-service', release: SERVICE_VERSION });
 */
export function initSentry(options: InitSentryOptions): boolean {
  const dsn = (options.dsn ?? process.env.SENTRY_DSN ?? '').trim();
  if (dsn === '') {
    setErrorReporter(null);
    return false;
  }
  Sentry.init({
    dsn,
    release: `${options.service}@${options.release}`,
    environment: options.environment ?? process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
    // Recolección mínima desde el origen; beforeSend limpia lo que aun así llegue.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { deny: [...SENSITIVE_HEADER_NAMES] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: options.tracesSampleRate ?? 0,
    initialScope: { tags: { service: options.service } },
    beforeSend: (event) => scrubSentryEvent(event),
    beforeBreadcrumb: (breadcrumb) => {
      // Los breadcrumbs de consola repiten logs que ya pasan por la redacción de pino.
      if (breadcrumb.category === 'console') {
        return null;
      }
      return breadcrumb;
    },
  });
  setErrorReporter((error, context) => {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        if (value !== undefined) {
          scope.setTag(key, String(value));
        }
      }
      Sentry.captureException(error);
    });
  });
  return true;
}
