import * as Sentry from '@sentry/nextjs';

/**
 * Sentry opcional y solo en el servidor (C23): sin SENTRY_DSN no se inicializa.
 * Nunca se envía PII: sin IP ni cabeceras, sin cookies, sin cuerpo ni query.
 * En el navegador no se carga Sentry (la CSP solo permite conexiones al propio origen).
 */
export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || process.env.NEXT_RUNTIME !== 'nodejs') return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    tracesSampleRate: 0,
    beforeSend(event) {
      delete event.user;
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
        delete event.request.data;
        delete event.request.query_string;
        if (event.request.url) event.request.url = event.request.url.split('?')[0];
      }
      return event;
    },
    beforeBreadcrumb(breadcrumb) {
      // Las URLs de fetch hacia los servicios pueden llevar filtros con correos o teléfonos.
      if (breadcrumb.data && typeof breadcrumb.data.url === 'string') {
        breadcrumb.data.url = breadcrumb.data.url.split('?')[0];
      }
      return breadcrumb;
    },
  });
}

export const onRequestError: typeof Sentry.captureRequestError = (...args) => {
  if (!process.env.SENTRY_DSN) return;
  Sentry.captureRequestError(...args);
};
