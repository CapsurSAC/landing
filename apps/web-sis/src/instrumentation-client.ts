/**
 * Sentry en el navegador (C23). Solo se descarga el SDK si hay DSN: con la
 * variable vacía no se añade nada al bundle inicial (importación dinámica).
 * Sin PII (dataCollection desactivado + beforeSend que limpia) y sin trazas.
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  void Promise.all([import('@sentry/nextjs'), import('@/lib/sentry-scrub'), import('@/lib/sentry-options')]).then(
    ([Sentry, { scrubEvent }, { SENTRY_DATA_COLLECTION }]) => {
      Sentry.init({
        dsn,
        dataCollection: { ...SENTRY_DATA_COLLECTION, httpBodies: [] },
        tracesSampleRate: 0,
        beforeSend: (event) => scrubEvent(event),
        // Nunca se registran pulsaciones ni valores de campos.
        beforeBreadcrumb: (crumb) => (crumb.category === 'ui.input' ? null : crumb),
      });
    },
  );
}
