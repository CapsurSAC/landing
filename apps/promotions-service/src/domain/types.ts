/** Línea formativa de una especialidad, en el vocabulario del contrato público. */
export type SpecialtyTrack = 'ia' | 'tradicional';

export const SPECIALTY_TRACKS: readonly SpecialtyTrack[] = ['ia', 'tradicional'];

/** Icono de la tarjeta de promoción, en el vocabulario del contrato público. */
export type PromotionIcon = 'gift' | 'layers' | 'stack';

/** Importe monetario. `amount` siempre en céntimos. */
export interface Money {
  readonly amount: number;
  readonly currency: string;
}
