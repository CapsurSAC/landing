import { PromotionValidationSchema, SlugSchema, SpecialtyTrackSchema, type Brand } from '@capsur/api-contracts';
import { z } from 'zod';

/**
 * Respuesta de `GET /internal/promotions/:id/validate` extendida localmente
 * (A3): promotions-service añade `specialtiesIncluded` y `allowedSpecialties`.
 * Ambos son opcionales mientras promotions-service no los publique; si faltan,
 * la promoción se trata como si no aceptara especialidades (salvo lista vacía).
 */
export const CatalogPromotionSchema = PromotionValidationSchema.extend({
  specialtiesIncluded: z.number().int().min(0).optional(),
  allowedSpecialties: z
    .array(z.object({ id: SlugSchema, name: z.string().min(1), track: SpecialtyTrackSchema }))
    .optional(),
});
export type CatalogPromotion = z.infer<typeof CatalogPromotionSchema>;

/**
 * Catálogo de promociones (promotions-service). Lanza
 * `PromotionNotAvailableError` si no existe o está inactiva y
 * `CatalogUnavailableError` si no se puede consultar.
 */
export interface PromotionCatalog {
  validate(promotionId: string, brand: Brand): Promise<CatalogPromotion>;
}

export const PROMOTION_CATALOG = Symbol('PROMOTION_CATALOG');
