import { BrandNotFoundError, PromotionNotFoundError } from '../../domain';
import {
  toContractBrand,
  toPromotionValidation,
  type PromotionValidationWithSpecialties,
} from '../mappers/contract.mapper';
import { type BrandRepository, type Clock, type PromotionRepository, type SpecialtyRepository } from '../ports';

export interface ValidatePromotionInput {
  readonly brandId: string;
  readonly promotionId: string;
}

export interface ValidatePromotionDeps {
  readonly brands: BrandRepository;
  readonly promotions: PromotionRepository;
  readonly specialties: SpecialtyRepository;
  readonly clock: Clock;
}

/**
 * Devuelve el precio autoritativo de una promoción, si está vigente ahora y
 * qué especialidades admite (A3). No usa caché: leads-service necesita el
 * dato fresco antes de registrar.
 */
export class ValidatePromotion {
  constructor(private readonly deps: ValidatePromotionDeps) {}

  async execute(input: ValidatePromotionInput): Promise<PromotionValidationWithSpecialties> {
    const brand = await this.deps.brands.findActiveById(input.brandId);
    if (!brand) {
      throw new BrandNotFoundError(input.brandId);
    }
    const contractBrand = toContractBrand(brand);

    const promotion = await this.deps.promotions.findById(brand.id, input.promotionId);
    if (!promotion) {
      throw new PromotionNotFoundError(brand.id, input.promotionId);
    }

    const specialties = await this.deps.specialties.findActiveByBrand(brand.id);
    return toPromotionValidation(promotion, contractBrand, this.deps.clock.now(), specialties);
  }
}
