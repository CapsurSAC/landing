import type { ExperimentExposure, TrackingEventName, TrackingEventRequest } from '@capsur/api-contracts';
import { sendTrackingEvent } from './api-client';
import { rememberAttribution } from './attribution';
import { siteConfig } from './config';
import { HERO_COPY_EXPERIMENT, readHeroVariant, SESSION_STORAGE_KEY } from './experiments';

export function getSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, fresh);
    return fresh;
  } catch {
    return crypto.randomUUID();
  }
}

/** Exposición al experimento del hero, si está activo en esta página. */
export function currentExperiment(): ExperimentExposure | undefined {
  if (!siteConfig.experimentsEnabled) return undefined;
  const variant = readHeroVariant();
  return variant ? { id: HERO_COPY_EXPERIMENT.id, variant } : undefined;
}

type TrackingExtra = Partial<Pick<TrackingEventRequest, 'leadId' | 'promotionId' | 'specialtyId'>>;

/**
 * Envía un evento autorizado (sin datos personales) a leads-service.
 * Nunca bloquea la interfaz ni lanza errores: la analítica es secundaria.
 */
export function track(event: TrackingEventName, extra: TrackingExtra = {}): void {
  if (typeof window === 'undefined') return;
  const experiment = currentExperiment();
  sendTrackingEvent({
    brand: siteConfig.brand,
    event,
    sessionId: getSessionId(),
    attribution: rememberAttribution(),
    occurredAt: new Date().toISOString(),
    ...(experiment ? { experiment } : {}),
    ...extra,
  });
}
