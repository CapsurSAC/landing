import { z } from 'zod';

/** Identificador de marca CAPSUR. Hoy solo SIS; se amplía sin romper el contrato. */
export const BrandSchema = z.enum(['sis']);
export type Brand = z.infer<typeof BrandSchema>;

/** Sede donde el interesado quiere estudiar o ser atendido. */
export const CampusSchema = z.enum(['tacna', 'arequipa']);
export type Campus = z.infer<typeof CampusSchema>;

/** Slug estable usado en URLs, eventos y configuración (minúsculas, guiones). */
export const SlugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Debe ser un slug en minúsculas con guiones');

/** Teléfono en formato E.164 (el backend normaliza antes de validar contra este esquema). */
export const E164PhoneSchema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, 'Debe ser un número E.164, por ejemplo +51987654321');

export const MoneySchema = z.object({
  amount: z.number().int().nonnegative().describe('Monto en céntimos'),
  currency: z.literal('PEN'),
});
export type Money = z.infer<typeof MoneySchema>;

/** Error estándar de la API (RFC 9457 simplificado). */
export const ApiErrorSchema = z.object({
  type: z.string().default('about:blank'),
  title: z.string(),
  status: z.number().int(),
  detail: z.string().optional(),
  code: z.string().optional(),
  errors: z
    .array(z.object({ path: z.string(), message: z.string() }))
    .optional()
    .describe('Errores de validación por campo'),
  traceId: z.string().optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const HealthSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  service: z.string(),
  version: z.string(),
  checks: z.record(z.string(), z.enum(['up', 'down'])).default({}),
  timestamp: z.string(),
});
export type Health = z.infer<typeof HealthSchema>;
