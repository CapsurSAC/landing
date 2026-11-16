import { z } from 'zod';
import { BrandSchema } from './common.js';

/* --------------------------------------------------------------------------
 * Libro de Reclamaciones virtual (Código de Protección y Defensa del
 * Consumidor, Ley 29571, y su reglamento). Lo gestiona leads-service.
 * POST /api/v1/complaints
 * ------------------------------------------------------------------------ */

export const ComplaintKindSchema = z.enum(['reclamo', 'queja']);
export const IdentityDocumentTypeSchema = z.enum(['DNI', 'CE', 'PASAPORTE']);

export const ComplaintRequestSchema = z
  .object({
    brand: BrandSchema,
    kind: ComplaintKindSchema.describe('reclamo: disconformidad con el servicio; queja: malestar con la atención'),
    consumer: z.object({
      fullName: z.string().trim().min(3).max(120),
      documentType: IdentityDocumentTypeSchema,
      documentNumber: z.string().trim().min(6).max(20).regex(/^[A-Za-z0-9-]+$/),
      address: z.string().trim().min(5).max(200),
      phone: z.string().trim().min(6).max(25),
      email: z.email().max(160).toLowerCase(),
      isMinor: z.boolean().default(false),
      guardianName: z.string().trim().max(120).optional(),
    }),
    item: z.object({
      type: z.enum(['producto', 'servicio']).default('servicio'),
      description: z.string().trim().min(3).max(300),
      amount: z.number().int().nonnegative().optional().describe('Monto reclamado en céntimos de sol'),
    }),
    detail: z.string().trim().min(10).max(3000),
    request: z.string().trim().min(5).max(1500).describe('Pedido del consumidor'),
    captchaToken: z.string().max(2048).optional(),
    website: z.string().max(0).optional(),
  })
  .refine((v) => !v.consumer.isMinor || (v.consumer.guardianName?.length ?? 0) >= 3, {
    path: ['consumer', 'guardianName'],
    message: 'Si eres menor de edad, indica el nombre de tu padre, madre o apoderado',
  });
export type ComplaintRequest = z.infer<typeof ComplaintRequestSchema>;
export type ComplaintInput = z.input<typeof ComplaintRequestSchema>;

export const ComplaintResponseSchema = z.object({
  complaintId: z.uuid(),
  /** Correlativo legible, p. ej. SIS-LR-2026-000123. */
  code: z.string(),
  receivedAt: z.iso.datetime(),
  /** Fecha límite de respuesta (15 días hábiles). */
  responseDueBy: z.iso.datetime(),
});
export type ComplaintResponse = z.infer<typeof ComplaintResponseSchema>;

/* --------------------------------------------------------------------------
 * Derechos ARCO (Ley 29733 y D.S. 016-2024-JUS). POST /api/v1/privacy/requests
 * ------------------------------------------------------------------------ */

export const PrivacyRequestTypeSchema = z.enum([
  'access',
  'rectification',
  'cancellation',
  'opposition',
  'revoke_consent',
]);
export type PrivacyRequestType = z.infer<typeof PrivacyRequestTypeSchema>;

export const PrivacyRequestSchema = z.object({
  brand: BrandSchema,
  type: PrivacyRequestTypeSchema,
  fullName: z.string().trim().min(3).max(120),
  email: z.email().max(160).toLowerCase(),
  phone: z.string().trim().min(6).max(25).optional(),
  /** Código de solicitud SIS-XXXXX si lo tiene; ayuda a ubicar sus datos. */
  reference: z.string().trim().max(20).optional(),
  detail: z.string().trim().max(1000).optional(),
  captchaToken: z.string().max(2048).optional(),
  website: z.string().max(0).optional(),
});
export type PrivacyRequest = z.infer<typeof PrivacyRequestSchema>;
export type PrivacyRequestInput = z.input<typeof PrivacyRequestSchema>;

export const PrivacyRequestResponseSchema = z.object({
  requestId: z.uuid(),
  code: z.string().describe('p. ej. SIS-ARCO-2026-000045'),
  receivedAt: z.iso.datetime(),
  /** Plazo legal de respuesta (20 días hábiles para acceso; se informa el más corto aplicable). */
  responseDueBy: z.iso.datetime(),
});
export type PrivacyRequestResponse = z.infer<typeof PrivacyRequestResponseSchema>;
