import type { Promotion, Specialty } from '@capsur/api-contracts';
import { fallbackPromotions, fallbackSpecialties } from './fallback-catalog';

export interface CatalogResult<T> {
  items: T[];
}

/**
 * Catálogo de la landing. Sin backend, la oferta vive en `fallback-catalog.ts`:
 * para cambiar precios o especialidades se edita ese archivo. Se mantiene la
 * firma asíncrona por si algún día vuelve a leerse de un servicio.
 */
export async function getPromotions(): Promise<CatalogResult<Promotion>> {
  return { items: fallbackPromotions };
}

export async function getSpecialties(): Promise<CatalogResult<Specialty>> {
  return { items: fallbackSpecialties };
}
