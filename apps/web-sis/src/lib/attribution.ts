import type { Attribution } from '@capsur/api-contracts';

const UTM_KEYS = {
  utm_source: 'utmSource',
  utm_medium: 'utmMedium',
  utm_campaign: 'utmCampaign',
  utm_content: 'utmContent',
  utm_term: 'utmTerm',
  fbclid: 'fbclid',
  gclid: 'gclid',
} as const;

const MAX_LENGTHS: Record<keyof Attribution, number> = {
  utmSource: 100,
  utmMedium: 100,
  utmCampaign: 150,
  utmContent: 150,
  utmTerm: 150,
  referrer: 500,
  landingPath: 300,
  fbclid: 200,
  gclid: 200,
};

function clip(value: string, max: number): string {
  return value.length > max ? value.slice(0, max) : value;
}

/**
 * Extrae la atribución de una URL y del referrer. Función pura para poder
 * probarla sin navegador.
 */
export function parseAttribution(url: string, referrer = ''): Attribution {
  const result: Attribution = {};
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return result;
  }

  for (const [param, key] of Object.entries(UTM_KEYS) as Array<[string, keyof Attribution]>) {
    const value = parsed.searchParams.get(param)?.trim();
    if (value) result[key] = clip(value, MAX_LENGTHS[key]);
  }

  const landingPath = `${parsed.pathname}${parsed.search}`;
  if (landingPath && landingPath !== '/') result.landingPath = clip(landingPath, MAX_LENGTHS.landingPath);

  if (referrer) {
    try {
      const ref = new URL(referrer);
      if (ref.host !== parsed.host) result.referrer = clip(ref.origin + ref.pathname, MAX_LENGTHS.referrer);
    } catch {
      // referrer malformado: se ignora
    }
  }

  return result;
}

const STORAGE_KEY = 'sis.attribution.v1';

/** Guarda la atribución de la primera visita de la sesión y la devuelve. */
export function rememberAttribution(): Attribution {
  if (typeof window === 'undefined') return {};
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored) as Attribution;
    const fresh = parseAttribution(window.location.href, document.referrer);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    return parseAttribution(window.location.href, document.referrer);
  }
}
