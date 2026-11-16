import type { Brand } from '@capsur/api-contracts';
import type { Clock } from '../../application/ports/clock';
import type { AppLogger } from '../../application/ports/logger';
import { CatalogPromotionSchema, type CatalogPromotion, type PromotionCatalog } from '../../application/ports/promotion-catalog';
import { CatalogUnavailableError, PromotionNotAvailableError } from '../../domain/errors';

export interface HttpPromotionCatalogOptions {
  baseUrl: string;
  /** `PROMOTIONS_SERVICE_TOKEN`: Bearer de leads-service ante promotions-service (C4). */
  token: string;
  /** Tiempo máximo de la petición. Por defecto 2000 ms. */
  timeoutMs?: number;
  /** Tiempo que una respuesta se considera fresca. Por defecto 60 s. */
  cacheTtlMs?: number;
  /** Tiempo que una respuesta caducada sirve como respaldo si el catálogo cae. Por defecto 10 min. */
  staleTtlMs?: number;
  fetchFn?: typeof fetch;
}

interface CacheEntry {
  value: CatalogPromotion;
  freshUntil: number;
  staleUntil: number;
}

/**
 * Cliente HTTP de promotions-service con caché en memoria por promoción.
 * Si el catálogo no responde se usa la última respuesta conocida (aunque esté
 * caducada); si no hay ninguna, se lanza `CatalogUnavailableError` (503).
 * Un 401/403 (token mal configurado) también se trata como catálogo no disponible.
 */
export class HttpPromotionCatalog implements PromotionCatalog {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly timeoutMs: number;
  private readonly cacheTtlMs: number;
  private readonly staleTtlMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly baseUrl: string;

  constructor(
    private readonly options: HttpPromotionCatalogOptions,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = options.timeoutMs ?? 2000;
    this.cacheTtlMs = options.cacheTtlMs ?? 60_000;
    this.staleTtlMs = options.staleTtlMs ?? 10 * 60_000;
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init));
  }

  async validate(promotionId: string, brand: Brand): Promise<CatalogPromotion> {
    const key = `${brand}:${promotionId}`;
    const now = this.clock.now().getTime();
    const cached = this.cache.get(key);
    if (cached && cached.freshUntil > now) {
      return cached.value;
    }
    const stale = cached && cached.staleUntil > now ? cached.value : null;

    const url = `${this.baseUrl}/internal/promotions/${encodeURIComponent(promotionId)}/validate?brand=${encodeURIComponent(brand)}`;
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: 'GET',
        headers: { accept: 'application/json', authorization: `Bearer ${this.options.token}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      return this.fallback(stale, promotionId, error);
    }

    if (response.status === 404) {
      this.cache.delete(key);
      throw new PromotionNotAvailableError(promotionId);
    }
    if (!response.ok) {
      return this.fallback(stale, promotionId, new Error(`promotions-service respondió HTTP ${response.status}`));
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      return this.fallback(stale, promotionId, error);
    }
    const parsed = CatalogPromotionSchema.safeParse(body);
    if (!parsed.success) {
      return this.fallback(stale, promotionId, new Error('Respuesta del catálogo fuera de contrato'));
    }

    this.cache.set(key, {
      value: parsed.data,
      freshUntil: now + this.cacheTtlMs,
      staleUntil: now + this.staleTtlMs,
    });
    return parsed.data;
  }

  private fallback(stale: CatalogPromotion | null, promotionId: string, cause: unknown): CatalogPromotion {
    if (stale) {
      this.logger.warn({ promotionId, err: cause }, 'Catálogo no disponible; se usa la última validación conocida');
      return stale;
    }
    this.logger.error({ promotionId, err: cause }, 'Catálogo de promociones no disponible y sin caché');
    throw new CatalogUnavailableError(cause);
  }
}
