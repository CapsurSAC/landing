import { type SpecialtiesResponse } from '@capsur/api-contracts';
import { BrandNotFoundError, type SpecialtyTrack } from '../../domain';
import { toContractBrand, toContractSpecialty } from '../mappers/contract.mapper';
import { type BrandRepository, type CatalogCache, type SpecialtyRepository } from '../ports';
import { specialtiesCacheKey } from './catalog-cache-keys';

export interface ListSpecialtiesInput {
  readonly brandId: string;
  readonly track?: SpecialtyTrack;
}

export interface ListSpecialtiesDeps {
  readonly brands: BrandRepository;
  readonly specialties: SpecialtyRepository;
  readonly cache: CatalogCache;
  readonly cacheTtlSeconds: number;
}

export { specialtiesCacheKey } from './catalog-cache-keys';

/** Lista las especialidades activas de una marca, opcionalmente por línea. */
export class ListSpecialties {
  constructor(private readonly deps: ListSpecialtiesDeps) {}

  async execute(input: ListSpecialtiesInput): Promise<SpecialtiesResponse> {
    const key = specialtiesCacheKey(input.brandId, input.track);
    const cached = await this.deps.cache.get<SpecialtiesResponse>(key);
    if (cached) {
      return cached;
    }

    const brand = await this.deps.brands.findActiveById(input.brandId);
    if (!brand) {
      throw new BrandNotFoundError(input.brandId);
    }
    const contractBrand = toContractBrand(brand);

    const specialties = await this.deps.specialties.findActiveByBrand(brand.id, input.track);
    const response: SpecialtiesResponse = {
      brand: contractBrand,
      items: specialties.map((specialty) => toContractSpecialty(specialty, contractBrand)),
    };

    if (this.deps.cacheTtlSeconds > 0) {
      await this.deps.cache.set(key, response, this.deps.cacheTtlSeconds);
    }
    return response;
  }
}
