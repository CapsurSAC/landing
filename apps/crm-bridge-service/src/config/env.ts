import { type Campus } from '@capsur/api-contracts';
import { loadEnv, type EnvSource } from '@capsur/config';
import { assertAllowedUrl } from '@capsur/nest-kit';
import { envDefinition, type Env } from './env.definition';

export { envDefinition, type Env };

/** Token de inyección de la configuración validada. */
export const APP_CONFIG = Symbol('APP_CONFIG');

/** Valida el entorno (lanza `EnvValidationError` sin mostrar valores). */
export function loadAppEnv(source: EnvSource = process.env): Env {
  return loadEnv(envDefinition, source);
}

/**
 * C20: `CHATWOOT_BASE_URL` debe pertenecer a `CHATWOOT_BASE_URL_ALLOWLIST`; en producción
 * además debe ser https. Lanza `UrlNotAllowedError` y el servicio no arranca.
 */
export function assertChatwootUrlAllowed(env: Pick<Env, 'CHATWOOT_BASE_URL' | 'CHATWOOT_BASE_URL_ALLOWLIST' | 'NODE_ENV'>): void {
  assertAllowedUrl(env.CHATWOOT_BASE_URL, env.CHATWOOT_BASE_URL_ALLOWLIST, { requireHttps: env.NODE_ENV === 'production' });
}

const PLACEHOLDER_TOKEN = 'change-me';
const PLACEHOLDER_HOSTS = ['example.com', 'example.org', 'example.net'];

/** Chatwoot cuenta como "no configurado" si el token o la URL siguen siendo los de ejemplo. */
export function isChatwootConfigured(env: Pick<Env, 'CHATWOOT_BASE_URL' | 'CHATWOOT_API_ACCESS_TOKEN'>): boolean {
  if (env.CHATWOOT_API_ACCESS_TOKEN.trim().toLowerCase() === PLACEHOLDER_TOKEN) {
    return false;
  }
  try {
    const host = new URL(env.CHATWOOT_BASE_URL).hostname.toLowerCase();
    return !PLACEHOLDER_HOSTS.some((placeholder) => host === placeholder || host.endsWith(`.${placeholder}`));
  } catch {
    return false;
  }
}

/** Meta Conversions API activa solo con pixel y token (A17). */
export function isMetaCapiEnabled(env: Pick<Env, 'META_PIXEL_ID' | 'META_CAPI_ACCESS_TOKEN'>): boolean {
  return Boolean(env.META_PIXEL_ID && env.META_CAPI_ACCESS_TOKEN);
}

/** Seguimiento con plantilla activo solo con bandera y nombre de plantilla (A6). */
export function isFollowupEnabled(env: Pick<Env, 'WHATSAPP_FOLLOWUP_ENABLED' | 'WHATSAPP_FOLLOWUP_TEMPLATE_NAME'>): boolean {
  return env.WHATSAPP_FOLLOWUP_ENABLED && Boolean(env.WHATSAPP_FOLLOWUP_TEMPLATE_NAME);
}

/** Bandeja de Chatwoot de una sede (A4): `CHATWOOT_INBOX_ID_BY_CAMPUS` o `CHATWOOT_INBOX_ID`. */
export function inboxResolver(env: Pick<Env, 'CHATWOOT_INBOX_ID' | 'CHATWOOT_INBOX_ID_BY_CAMPUS'>): (campus: Campus) => number {
  const byCampus: Partial<Record<Campus, number>> = env.CHATWOOT_INBOX_ID_BY_CAMPUS;
  return (campus) => byCampus[campus] ?? env.CHATWOOT_INBOX_ID;
}
