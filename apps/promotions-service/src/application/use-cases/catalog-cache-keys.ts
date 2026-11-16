import { type SpecialtyTrack } from '../../domain';

/**
 * Claves de caché del catálogo. Todas comparten el prefijo de la marca para
 * poder invalidarlas juntas tras un cambio desde el panel (B8). Subir la
 * versión (`v2`) invalida en bloque las claves con formato anterior.
 */
export function catalogCachePrefix(brandId: string): string {
  return `catalog:v2:${brandId}:`;
}

export function promotionsCacheKey(brandId: string): string {
  return `${catalogCachePrefix(brandId)}promotions`;
}

export function specialtiesCacheKey(brandId: string, track?: SpecialtyTrack): string {
  return `${catalogCachePrefix(brandId)}specialties:${track ?? 'all'}`;
}
