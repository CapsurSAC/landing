import type { Instrumentation } from 'next';
import { SENTRY_DATA_COLLECTION } from '@/lib/sentry-options';
import { scrubEvent } from '@/lib/sentry-scrub';

/**
 * Sentry en el servidor (C23): solo si NEXT_PUBLIC_SENTRY_DSN está definido.
 * Sin PII (`dataCollection` desactivado + `beforeSend` que limpia) y sin subir
 * mapas de fuente (no se usa withSentryConfig ni el plugin de build).
 */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

export async function register() {
  if (!dsn) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    dataCollection: { ...SENTRY_DATA_COLLECTION, httpBodies: [] },
    tracesSampleRate: 0,
    beforeSend: (event) => scrubEvent(event),
    beforeSendTransaction: (event) => scrubEvent(event),
  });
}

export const onRequestError: Instrumentation.onRequestError = async (...args) => {
  if (!dsn) return;
  const Sentry = await import('@sentry/nextjs');
  Sentry.captureRequestError(...args);
};
