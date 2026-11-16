import {
  PromotionsResponseSchema,
  SpecialtiesResponseSchema,
  type Promotion,
  type Specialty,
} from '@capsur/api-contracts';
import { fetchCatalogJson } from './api-client';
import { fallbackPromotions, fallbackSpecialties } from './fallback-catalog';

const BRAND = 'sis';

export type CatalogSource = 'service' | 'fallback';

export interface CatalogResult<T> {
  items: T[];
  source: CatalogSource;
}

/**
 * Lee el catálogo en el servidor (Zod completo aquí no afecta al navegador).
 * La respuesta queda en la caché de datos con la etiqueta `catalog`; si el
 * servicio no responde se usa el catálogo de respaldo, que no se cachea.
 */
async function fetchCatalog<T>(
  path: string,
  parse: (json: unknown) => { items: T[] },
  fallback: T[],
): Promise<CatalogResult<T>> {
  try {
    const parsed = parse(await fetchCatalogJson(path));
    if (parsed.items.length === 0) return { items: fallback, source: 'fallback' };
    return { items: parsed.items, source: 'service' };
  } catch (error) {
    console.warn('[catalog] usando catálogo de respaldo:', error instanceof Error ? error.message : error);
    return { items: fallback, source: 'fallback' };
  }
}

/** Promociones activas, ordenadas. En caso de fallo, catálogo de respaldo. */
export function getPromotions(): Promise<CatalogResult<Promotion>> {
  return fetchCatalog(
    `/api/v1/promotions?brand=${BRAND}`,
    (json) => PromotionsResponseSchema.parse(json),
    fallbackPromotions,
  );
}

export function getSpecialties(): Promise<CatalogResult<Specialty>> {
  return fetchCatalog(
    `/api/v1/specialties?brand=${BRAND}`,
    (json) => SpecialtiesResponseSchema.parse(json),
    fallbackSpecialties,
  );
}
