import { InvalidCatalogDataError } from './errors';
import { type Money, type PromotionIcon, type SpecialtyTrack } from './types';

export interface PromotionBundle {
  readonly specialtiesIncluded: number;
  readonly allowedTracks: readonly SpecialtyTrack[];
  readonly label: string;
}

export interface PromotionProps {
  readonly id: string;
  readonly brandId: string;
  readonly name: string;
  readonly headline: string;
  readonly price: Money;
  readonly listPrice: Money | null;
  readonly bundle: PromotionBundle;
  readonly featured: boolean;
  readonly icon: PromotionIcon;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
  readonly campaignId: string | null;
  readonly sortOrder: number;
  readonly active: boolean;
}

/**
 * Promoción comercial con precio y vigencia. Es la única fuente de verdad
 * sobre precios: ningún otro servicio los calcula.
 */
export class Promotion {
  readonly id: string;
  readonly brandId: string;
  readonly name: string;
  readonly headline: string;
  readonly price: Money;
  readonly listPrice: Money | null;
  readonly bundle: PromotionBundle;
  readonly featured: boolean;
  readonly icon: PromotionIcon;
  readonly validFrom: Date;
  readonly validUntil: Date | null;
  readonly campaignId: string | null;
  readonly sortOrder: number;
  readonly active: boolean;

  constructor(props: PromotionProps) {
    this.id = props.id;
    this.brandId = props.brandId;
    this.name = props.name;
    this.headline = props.headline;
    this.price = props.price;
    this.listPrice = props.listPrice;
    this.bundle = {
      specialtiesIncluded: props.bundle.specialtiesIncluded,
      allowedTracks: [...props.bundle.allowedTracks],
      label: props.bundle.label,
    };
    this.featured = props.featured;
    this.icon = props.icon;
    this.validFrom = new Date(props.validFrom.getTime());
    this.validUntil = props.validUntil ? new Date(props.validUntil.getTime()) : null;
    this.campaignId = props.campaignId;
    this.sortOrder = props.sortOrder;
    this.active = props.active;
  }

  /** Vigente en `date`: activa, ya iniciada y, si tiene fin, aún no vencida. */
  isAvailableAt(date: Date): boolean {
    if (!this.active) {
      return false;
    }
    const time = date.getTime();
    if (time < this.validFrom.getTime()) {
      return false;
    }
    return this.validUntil === null || time < this.validUntil.getTime();
  }
}

/** Máximo de especialidades que puede incluir un paquete. */
export const MAX_SPECIALTIES_PER_BUNDLE = 3;

/**
 * Reglas de negocio de una promoción editada desde el panel. Lanza
 * {@link InvalidCatalogDataError} con la ruta del campo que falla.
 */
export function assertValidPromotion(props: PromotionProps): void {
  if (props.validUntil && props.validUntil.getTime() <= props.validFrom.getTime()) {
    throw new InvalidCatalogDataError('validUntil', 'La fecha de fin debe ser posterior a la de inicio');
  }
  if (props.listPrice && props.listPrice.amount <= props.price.amount) {
    throw new InvalidCatalogDataError('listPrice', 'El precio de referencia debe ser mayor que el precio de la promoción');
  }
  if (props.price.amount <= 0) {
    throw new InvalidCatalogDataError('price', 'El precio debe ser mayor que cero');
  }
  const { specialtiesIncluded, allowedTracks } = props.bundle;
  if (specialtiesIncluded < 1 || specialtiesIncluded > MAX_SPECIALTIES_PER_BUNDLE) {
    throw new InvalidCatalogDataError(
      'bundle.specialtiesIncluded',
      `Una promoción incluye entre 1 y ${MAX_SPECIALTIES_PER_BUNDLE} especialidades`,
    );
  }
  if (allowedTracks.length === 0) {
    throw new InvalidCatalogDataError('bundle.allowedTracks', 'Indica al menos un tipo de especialidad permitido');
  }
  if (new Set(allowedTracks).size !== allowedTracks.length) {
    throw new InvalidCatalogDataError('bundle.allowedTracks', 'Hay tipos de especialidad repetidos');
  }
}

/** Orden de presentación: `sortOrder` ascendente y, a igualdad, por id. */
export function comparePromotions(a: Promotion, b: Promotion): number {
  return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
}
