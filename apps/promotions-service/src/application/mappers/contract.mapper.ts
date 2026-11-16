import {
  type AdminPromotion,
  type AdminPromotionInput,
  type AdminSpecialtyInput,
  BrandSchema,
  type Brand as ContractBrand,
  type Promotion as ContractPromotion,
  type PromotionValidation,
  type Specialty as ContractSpecialty,
} from '@capsur/api-contracts';
import {
  type Brand,
  BrandNotFoundError,
  type Promotion,
  type PromotionProps,
  type Specialty,
  type SpecialtyProps,
  type SpecialtyTrack,
} from '../../domain';
import { type PromotionRecord } from '../ports';

/**
 * Convierte el id de marca del dominio al enum del contrato. Una marca que la
 * base de datos conoce pero el contrato público todavía no, no se expone.
 */
export function toContractBrand(brand: Brand): ContractBrand {
  const parsed = BrandSchema.safeParse(brand.id);
  if (!parsed.success) {
    throw new BrandNotFoundError(brand.id);
  }
  return parsed.data;
}

export function toContractPromotion(promotion: Promotion, brand: ContractBrand): ContractPromotion {
  return {
    id: promotion.id,
    brand,
    name: promotion.name,
    headline: promotion.headline,
    price: { amount: promotion.price.amount, currency: 'PEN' },
    ...(promotion.listPrice
      ? { listPrice: { amount: promotion.listPrice.amount, currency: 'PEN' as const } }
      : {}),
    bundle: {
      specialtiesIncluded: promotion.bundle.specialtiesIncluded,
      allowedTracks: [...promotion.bundle.allowedTracks],
      label: promotion.bundle.label,
    },
    featured: promotion.featured,
    icon: promotion.icon,
    validFrom: promotion.validFrom.toISOString(),
    validUntil: promotion.validUntil ? promotion.validUntil.toISOString() : null,
    campaignId: promotion.campaignId,
    sortOrder: promotion.sortOrder,
  };
}

export function toAdminPromotion(record: PromotionRecord, brand: ContractBrand): AdminPromotion {
  return {
    ...toContractPromotion(record.promotion, brand),
    active: record.promotion.active,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** Datos del panel → propiedades de dominio (las reglas se validan aparte). */
export function promotionPropsFromInput(input: AdminPromotionInput): PromotionProps {
  return {
    id: input.id,
    brandId: input.brand,
    name: input.name,
    headline: input.headline,
    price: { amount: input.price.amount, currency: input.price.currency },
    listPrice: input.listPrice ? { amount: input.listPrice.amount, currency: input.listPrice.currency } : null,
    bundle: {
      specialtiesIncluded: input.bundle.specialtiesIncluded,
      allowedTracks: [...input.bundle.allowedTracks],
      label: input.bundle.label,
    },
    featured: input.featured,
    icon: input.icon,
    validFrom: new Date(input.validFrom),
    validUntil: input.validUntil ? new Date(input.validUntil) : null,
    campaignId: input.campaignId,
    sortOrder: input.sortOrder,
    active: input.active,
  };
}

export function toContractSpecialty(specialty: Specialty, brand: ContractBrand): ContractSpecialty {
  return {
    id: specialty.id,
    brand,
    name: specialty.name,
    ...(specialty.shortName ? { shortName: specialty.shortName } : {}),
    track: specialty.track,
    summary: specialty.summary,
    audience: [...specialty.audience],
    modality: specialty.modality,
    ...(specialty.endorsedBy ? { endorsedBy: specialty.endorsedBy } : {}),
    sortOrder: specialty.sortOrder,
  };
}

/** Especialidad del panel: contrato público + estado activo. */
export type AdminSpecialty = ContractSpecialty & { active: boolean };

export function toAdminSpecialty(specialty: Specialty, brand: ContractBrand): AdminSpecialty {
  return { ...toContractSpecialty(specialty, brand), active: specialty.active };
}

export function specialtyPropsFromInput(input: AdminSpecialtyInput): SpecialtyProps {
  return {
    id: input.id,
    brandId: input.brand,
    name: input.name,
    shortName: input.shortName ?? null,
    track: input.track,
    summary: input.summary,
    audience: [...input.audience],
    modality: input.modality,
    endorsedBy: input.endorsedBy ?? null,
    sortOrder: input.sortOrder,
    active: input.active,
  };
}

/** Especialidad que una promoción permite elegir (respuesta interna para leads-service). */
export interface AllowedSpecialty {
  readonly id: string;
  readonly name: string;
  readonly track: SpecialtyTrack;
}

/**
 * Respuesta de `/internal/promotions/:id/validate`. Extiende el contrato con
 * los cupos y especialidades elegibles (A3); campos adicionales y opcionales
 * para consumidores que validan con el esquema base.
 */
export type PromotionValidationWithSpecialties = PromotionValidation & {
  readonly specialtiesIncluded: number;
  readonly allowedSpecialties: readonly AllowedSpecialty[];
};

export function toPromotionValidation(
  promotion: Promotion,
  brand: ContractBrand,
  availableAt: Date,
  specialties: readonly Specialty[] = [],
): PromotionValidationWithSpecialties {
  const allowed = new Set<SpecialtyTrack>(promotion.bundle.allowedTracks);
  return {
    id: promotion.id,
    brand,
    name: promotion.name,
    headline: promotion.headline,
    price: { amount: promotion.price.amount, currency: 'PEN' },
    active: promotion.isAvailableAt(availableAt),
    campaignId: promotion.campaignId,
    specialtiesIncluded: promotion.bundle.specialtiesIncluded,
    allowedSpecialties: specialties
      .filter((specialty) => specialty.active && allowed.has(specialty.track))
      .map((specialty) => ({ id: specialty.id, name: specialty.name, track: specialty.track })),
  };
}
