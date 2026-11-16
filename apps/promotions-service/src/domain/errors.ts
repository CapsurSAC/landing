/** Base de los errores de dominio: llevan un código estable para el cliente. */
export abstract class DomainError extends Error {
  abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class BrandNotFoundError extends DomainError {
  readonly code = 'BRAND_NOT_FOUND';

  constructor(readonly brandId: string) {
    super(`La marca "${brandId}" no existe o no está activa`);
  }
}

export class PromotionNotFoundError extends DomainError {
  readonly code = 'PROMOTION_NOT_FOUND';

  constructor(
    readonly brandId: string,
    readonly promotionId: string,
  ) {
    super(`La promoción "${promotionId}" no existe para la marca "${brandId}"`);
  }
}

export class PromotionAlreadyExistsError extends DomainError {
  readonly code = 'PROMOTION_ALREADY_EXISTS';

  constructor(readonly promotionId: string) {
    super(`Ya existe una promoción con el identificador "${promotionId}"`);
  }
}

export class SpecialtyNotFoundError extends DomainError {
  readonly code = 'SPECIALTY_NOT_FOUND';

  constructor(
    readonly brandId: string,
    readonly specialtyId: string,
  ) {
    super(`La especialidad "${specialtyId}" no existe para la marca "${brandId}"`);
  }
}

export class CampaignNotFoundError extends DomainError {
  readonly code = 'CAMPAIGN_NOT_FOUND';

  constructor(readonly campaignId: string) {
    super(`La campaña "${campaignId}" no existe`);
  }
}

/** Una regla de negocio del catálogo no se cumple; `path` apunta al campo. */
export class InvalidCatalogDataError extends DomainError {
  readonly code = 'INVALID_CATALOG_DATA';

  constructor(
    readonly path: string,
    message: string,
  ) {
    super(message);
  }
}
