import { z } from 'zod';
import { BrandSchema, MoneySchema, SlugSchema } from './common';

export const SpecialtyTrackSchema = z.enum(['ia', 'tradicional']);
export type SpecialtyTrack = z.infer<typeof SpecialtyTrackSchema>;

export const SpecialtySchema = z.object({
  id: SlugSchema,
  brand: BrandSchema,
  name: z.string(),
  shortName: z.string().optional(),
  track: SpecialtyTrackSchema,
  summary: z.string(),
  audience: z.array(z.string()).default([]),
  modality: z.string().default('100% virtual'),
  endorsedBy: z.string().optional(),
  sortOrder: z.number().int().default(0),
});
export type Specialty = z.infer<typeof SpecialtySchema>;

/** Regla de cuántas especialidades y de qué tipo incluye la promoción. */
export const PromotionBundleSchema = z.object({
  specialtiesIncluded: z.number().int().min(1),
  allowedTracks: z.array(SpecialtyTrackSchema).min(1),
  label: z.string().describe('Texto corto para la tarjeta, p. ej. "1 especialidad"'),
});
export type PromotionBundle = z.infer<typeof PromotionBundleSchema>;

export const PromotionIconSchema = z.enum(['gift', 'layers', 'stack']);

export const PromotionSchema = z.object({
  id: SlugSchema,
  brand: BrandSchema,
  name: z.string().describe('Nombre comercial, p. ej. "CON IA"'),
  headline: z.string().describe('Precio o gancho mostrado en grande, p. ej. "S/249"'),
  price: MoneySchema,
  listPrice: MoneySchema.optional().describe('Precio de referencia tachado, si aplica'),
  bundle: PromotionBundleSchema,
  featured: z.boolean().default(false),
  icon: PromotionIconSchema.default('layers'),
  validFrom: z.iso.datetime(),
  validUntil: z.iso.datetime().nullable(),
  campaignId: SlugSchema.nullable().default(null),
  sortOrder: z.number().int().default(0),
});
export type Promotion = z.infer<typeof PromotionSchema>;

export const PromotionsResponseSchema = z.object({
  brand: BrandSchema,
  items: z.array(PromotionSchema),
  generatedAt: z.iso.datetime(),
});
export type PromotionsResponse = z.infer<typeof PromotionsResponseSchema>;

export const SpecialtiesResponseSchema = z.object({
  brand: BrandSchema,
  items: z.array(SpecialtySchema),
});
export type SpecialtiesResponse = z.infer<typeof SpecialtiesResponseSchema>;

/** Respuesta interna que usa leads-service para validar una promoción antes de registrar. */
export const PromotionValidationSchema = z.object({
  id: SlugSchema,
  brand: BrandSchema,
  name: z.string(),
  headline: z.string(),
  price: MoneySchema,
  active: z.boolean(),
  campaignId: SlugSchema.nullable(),
});
export type PromotionValidation = z.infer<typeof PromotionValidationSchema>;
