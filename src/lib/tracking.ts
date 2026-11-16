import type { ExperimentExposure, TrackingEventName, TrackingEventRequest } from '@capsur/api-contracts';
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

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

/**
 * Publica un evento (sin datos personales) en `window.dataLayer`, donde lo
 * recoge Google Tag Manager si está instalado. Sin GTM no hace nada visible.
 * Nunca bloquea la interfaz ni lanza errores: la analítica es secundaria.
 */
export function track(event: TrackingEventName, extra: TrackingExtra = {}): void {
  if (typeof window === 'undefined') return;
  const experiment = currentExperiment();
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({
    event,
    brand: siteConfig.brand,
    sessionId: getSessionId(),
    ...rememberAttribution(),
    ...(experiment ? { experimentId: experiment.id, experimentVariant: experiment.variant } : {}),
    ...extra,
  });
}
