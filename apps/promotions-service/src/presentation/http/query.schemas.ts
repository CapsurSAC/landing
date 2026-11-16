import { SlugSchema, SpecialtyTrackSchema } from '@capsur/api-contracts';
import { z } from 'zod';

/** Marca por defecto cuando el cliente no la indica. */
export const DEFAULT_BRAND = 'sis';

/**
 * `brand` se valida solo por forma (slug): la existencia la decide el caso de
 * uso, de modo que una marca desconocida responde 404 y no 400.
 */
export const BrandQuerySchema = z.object({
  brand: SlugSchema.default(DEFAULT_BRAND),
});
export type BrandQuery = z.infer<typeof BrandQuerySchema>;

export const SpecialtiesQuerySchema = BrandQuerySchema.extend({
  track: SpecialtyTrackSchema.optional(),
});
export type SpecialtiesQuery = z.infer<typeof SpecialtiesQuerySchema>;

export const PromotionIdParamSchema = SlugSchema;
