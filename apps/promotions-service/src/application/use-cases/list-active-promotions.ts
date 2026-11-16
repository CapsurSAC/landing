import { type PromotionsResponse } from '@capsur/api-contracts';
import { BrandNotFoundError, comparePromotions } from '../../domain';
import { toContractBrand, toContractPromotion } from '../mappers/contract.mapper';
import {
  type BrandRepository,
  type CatalogCache,
  type Clock,
  type PromotionRepository,
} from '../ports';
import { promotionsCacheKey } from './catalog-cache-keys';

export interface ListActivePromotionsInput {
  readonly brandId: string;
}

export interface ListActivePromotionsDeps {
  readonly brands: BrandRepository;
  readonly promotions: PromotionRepository;
  readonly cache: CatalogCache;
  readonly clock: Clock;
  /** Segundos de vida de la entrada en caché. `0` desactiva la escritura. */
  readonly cacheTtlSeconds: number;
}

/** Clave de caché por marca; el prefijo versiona el formato almacenado. */
export { promotionsCacheKey } from './catalog-cache-keys';

/**
 * Lista las promociones activas y vigentes de una marca, ordenadas por
 * `sortOrder`, en el formato del contrato público.
 */
export class ListActivePromotions {
  constructor(private readonly deps: ListActivePromotionsDeps) {}

  async execute(input: ListActivePromotionsInput): Promise<PromotionsResponse> {
    const key = promotionsCacheKey(input.brandId);
    const cached = await this.deps.cache.get<PromotionsResponse>(key);
    if (cached) {
      return cached;
    }

    const brand = await this.deps.brands.findActiveById(input.brandId);
    if (!brand) {
      throw new BrandNotFoundError(input.brandId);
    }
    const contractBrand = toContractBrand(brand);

    const now = this.deps.clock.now();
    const all = await this.deps.promotions.findActiveByBrand(brand.id);
    const items = all
      .filter((promotion) => promotion.isAvailableAt(now))
      .sort(comparePromotions)
      .map((promotion) => toContractPromotion(promotion, contractBrand));

    const response: PromotionsResponse = {
      brand: contractBrand,
      items,
      generatedAt: now.toISOString(),
    };

    if (this.deps.cacheTtlSeconds > 0) {
      await this.deps.cache.set(key, response, this.deps.cacheTtlSeconds);
    }
    return response;
  }
}
