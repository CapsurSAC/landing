import { type Promotion } from '../../domain';

/** Promoción con las marcas de tiempo que solo necesita el panel. */
export interface PromotionRecord {
  readonly promotion: Promotion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PromotionRepository {
  /**
   * Promociones con `active = true` de la marca, sin filtrar por vigencia
   * (la vigencia la decide el caso de uso con el reloj inyectado).
   */
  findActiveByBrand(brandId: string): Promise<Promotion[]>;

  /** Promoción por id dentro de la marca, activa o no; `null` si no existe. */
  findById(brandId: string, promotionId: string): Promise<Promotion | null>;

  /** Todas las promociones de la marca (incluidas inactivas), para el panel. */
  listByBrand(brandId: string): Promise<PromotionRecord[]>;

  /**
   * Crea la promoción. Lanza `PromotionAlreadyExistsError` si el id existe y
   * `CampaignNotFoundError` si la campaña no existe.
   */
  create(promotion: Promotion): Promise<PromotionRecord>;

  /** Reemplaza todos los campos editables. `PromotionNotFoundError` si no existe. */
  update(promotion: Promotion): Promise<PromotionRecord>;
}
