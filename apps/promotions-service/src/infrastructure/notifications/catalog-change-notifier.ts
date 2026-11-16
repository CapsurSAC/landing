import { Logger } from '@nestjs/common';
import { type CatalogCache, type CatalogChangeNotifier } from '../../application/ports';
import { catalogCachePrefix } from '../../application/use-cases/catalog-cache-keys';

export interface CatalogRevalidationOptions {
  /** Endpoint de la landing (`POST /api/revalidate`); sin URL no se avisa. */
  readonly url?: string;
  readonly secret?: string;
  /** Tiempo máximo de la llamada. Por defecto 3 s. */
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

/** Etiqueta de caché de datos que usa la landing para el catálogo (ver spec §4). */
export const CATALOG_TAG = 'catalog';

/**
 * Tras un cambio en el catálogo: borra la caché de Redis de la marca y pide a
 * la landing que revalide la etiqueta `catalog` (B8). Nunca lanza.
 */
export class HttpCatalogChangeNotifier implements CatalogChangeNotifier {
  private readonly logger = new Logger(HttpCatalogChangeNotifier.name);
  private readonly fetchImpl: typeof fetch;

  constructor(
    private readonly cache: CatalogCache,
    private readonly options: CatalogRevalidationOptions,
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async catalogChanged(brandId: string): Promise<void> {
    await this.cache.invalidatePrefix(catalogCachePrefix(brandId));
    await this.revalidateWeb(brandId);
  }

  private async revalidateWeb(brandId: string): Promise<void> {
    const { url, secret } = this.options;
    if (!url || !secret) {
      this.logger.debug('WEB_REVALIDATE_URL/SECRET no configurados: la landing refrescará por tiempo');
      return;
    }
    try {
      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-revalidate-secret': secret },
        body: JSON.stringify({ tags: [CATALOG_TAG] }),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 3000),
      });
      if (!response.ok) {
        this.logger.warn({ brandId, status: response.status }, 'La landing rechazó la revalidación del catálogo');
        return;
      }
      this.logger.log({ brandId }, 'Landing revalidada tras cambio de catálogo');
    } catch (error) {
      this.logger.warn(
        { brandId, error: error instanceof Error ? error.message : String(error) },
        'No se pudo avisar a la landing; refrescará por tiempo',
      );
    }
  }
}
