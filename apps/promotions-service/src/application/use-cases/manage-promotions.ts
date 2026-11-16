import { type AdminPromotion, type AdminPromotionInput } from '@capsur/api-contracts';
import {
  assertValidPromotion,
  type Brand,
  BrandNotFoundError,
  InvalidCatalogDataError,
  Promotion,
  PromotionNotFoundError,
} from '../../domain';
import { promotionPropsFromInput, toAdminPromotion, toContractBrand } from '../mappers/contract.mapper';
import { type BrandRepository, type CatalogChangeNotifier, type PromotionRepository } from '../ports';

export interface ManagePromotionsDeps {
  readonly brands: BrandRepository;
  readonly promotions: PromotionRepository;
  readonly notifier: CatalogChangeNotifier;
}

/**
 * Administración de promociones desde el panel (A1). Cada cambio valida las
 * reglas de negocio y, al guardarse, avisa del cambio de catálogo para
 * invalidar cachés y revalidar la landing (B8).
 */
export class ManagePromotions {
  constructor(private readonly deps: ManagePromotionsDeps) {}

  async list(brandId: string): Promise<AdminPromotion[]> {
    const brand = await this.requireBrand(brandId);
    const records = await this.deps.promotions.listByBrand(brand.id);
    const contractBrand = toContractBrand(brand);
    return records.map((record) => toAdminPromotion(record, contractBrand));
  }

  async create(input: AdminPromotionInput): Promise<AdminPromotion> {
    const brand = await this.requireBrand(input.brand);
    const props = promotionPropsFromInput(input);
    assertValidPromotion(props);
    const record = await this.deps.promotions.create(new Promotion(props));
    await this.deps.notifier.catalogChanged(brand.id);
    return toAdminPromotion(record, toContractBrand(brand));
  }

  async update(promotionId: string, input: AdminPromotionInput): Promise<AdminPromotion> {
    if (input.id !== promotionId) {
      throw new InvalidCatalogDataError('id', 'El identificador del cuerpo no coincide con el de la ruta');
    }
    const brand = await this.requireBrand(input.brand);
    const existing = await this.deps.promotions.findById(brand.id, promotionId);
    if (!existing) {
      throw new PromotionNotFoundError(brand.id, promotionId);
    }
    const props = promotionPropsFromInput(input);
    assertValidPromotion(props);
    const record = await this.deps.promotions.update(new Promotion(props));
    await this.deps.notifier.catalogChanged(brand.id);
    return toAdminPromotion(record, toContractBrand(brand));
  }

  async deactivate(brandId: string, promotionId: string): Promise<AdminPromotion> {
    const brand = await this.requireBrand(brandId);
    const existing = await this.deps.promotions.findById(brand.id, promotionId);
    if (!existing) {
      throw new PromotionNotFoundError(brand.id, promotionId);
    }
    const record = await this.deps.promotions.update(new Promotion({ ...existing, active: false }));
    await this.deps.notifier.catalogChanged(brand.id);
    return toAdminPromotion(record, toContractBrand(brand));
  }

  private async requireBrand(brandId: string): Promise<Brand> {
    const brand = await this.deps.brands.findActiveById(brandId);
    if (!brand) {
      throw new BrandNotFoundError(brandId);
    }
    return brand;
  }
}
