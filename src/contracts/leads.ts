import { z } from 'zod';
import { BrandSchema, CampusSchema, E164PhoneSchema, SlugSchema } from './common';

export const ConsentSchema = z.object({
  contactAccepted: z.literal(true, {
    error: 'Debes aceptar ser contactado para enviarte el catálogo',
  }),
  marketingAccepted: z.boolean().default(false).describe('Autorización separada para publicidad'),
  privacyVersion: z.string().min(1).max(32),
});
export type Consent = z.infer<typeof ConsentSchema>;

export const AttributionSchema = z
  .object({
    utmSource: z.string().max(100),
    utmMedium: z.string().max(100),
    utmCampaign: z.string().max(150),
    utmContent: z.string().max(150),
    utmTerm: z.string().max(150),
    referrer: z.string().max(500),
    landingPath: z.string().max(300),
    fbclid: z.string().max(200),
    gclid: z.string().max(200),
  })
  .partial();
export type Attribution = z.infer<typeof AttributionSchema>;

/** Experimento A/B al que estuvo expuesto el visitante (asignado por sessionId en el navegador). */
export const ExperimentExposureSchema = z.object({
  id: SlugSchema,
  variant: z.string().min(1).max(32).regex(/^[a-z0-9-]+$/),
});
export type ExperimentExposure = z.infer<typeof ExperimentExposureSchema>;

const NAME_PATTERN = /^[\p{L}\p{M}'’ .-]+$/u;

/** Cuerpo de POST /api/v1/leads. El precio nunca viaja desde el navegador. */
export const CreateLeadRequestSchema = z.object({
  brand: BrandSchema,
  promotionId: SlugSchema,
  /**
   * Especialidades elegidas dentro de la promoción. Puede ir vacío ("lo decido
   * con un asesor"). El backend valida cantidad y tipo contra el bundle.
   */
  specialtyIds: z.array(SlugSchema).max(3).default([]),
  campus: CampusSchema.default('tacna'),
  fullName: z
    .string()
    .trim()
    .min(3, 'Escribe tu nombre y apellidos')
    .max(120)
    .regex(NAME_PATTERN, 'Solo letras y espacios'),
  phone: z
    .string()
    .trim()
    .min(6, 'Escribe tu número de WhatsApp')
    .max(25)
    .describe('Número tal como lo escribió el usuario; el backend lo normaliza a E.164'),
  phoneCountry: z.string().length(2).default('PE').describe('ISO 3166-1 alfa-2'),
  email: z.email('Escribe un correo válido').max(160).toLowerCase(),
  consent: ConsentSchema,
  attribution: AttributionSchema.optional(),
  experiment: ExperimentExposureSchema.optional(),
  /** Token de Cloudflare Turnstile; obligatorio solo si el servidor tiene TURNSTILE_SECRET_KEY. */
  captchaToken: z.string().max(2048).optional(),
  /** Anti-bot: campo oculto que debe venir vacío. */
  website: z.string().max(0).optional(),
});
export type CreateLeadRequest = z.infer<typeof CreateLeadRequestSchema>;
export type CreateLeadInput = z.input<typeof CreateLeadRequestSchema>;

export const LeadStatusSchema = z.enum(['registered', 'crm_syncing', 'crm_synced', 'crm_failed']);
export type LeadStatus = z.infer<typeof LeadStatusSchema>;

export const CreateLeadResponseSchema = z.object({
  leadId: z.uuid(),
  /** Código corto legible que viaja en el mensaje de WhatsApp (p. ej. SIS-7K3M2). */
  reference: z.string(),
  status: LeadStatusSchema,
  phone: E164PhoneSchema,
  campus: CampusSchema,
  promotion: z.object({ id: SlugSchema, name: z.string(), headline: z.string() }),
  specialties: z.array(z.object({ id: SlugSchema, name: z.string() })).default([]),
  whatsapp: z.object({
    number: z.string().describe('Número de la empresa en E.164 sin "+"'),
    prefilledMessage: z.string(),
    url: z.url(),
  }),
  /**
   * Token firmado (HMAC) que autoriza a consultar el estado del lead y enviar
   * la encuesta de origen. Se envía en la cabecera `x-lead-token`. Evita que un
   * UUID filtrado permita leer el estado de otro lead.
   */
  statusToken: z.string().min(16),
  /** true si el Idempotency-Key ya se había procesado y se devolvió el resultado previo. */
  replayed: z.boolean().default(false),
});
export type CreateLeadResponse = z.infer<typeof CreateLeadResponseSchema>;

/** GET /api/v1/leads/{leadId}/status — requiere cabecera `x-lead-token`. */
export const LeadStatusResponseSchema = z.object({
  leadId: z.uuid(),
  reference: z.string(),
  status: LeadStatusSchema,
  crm: z
    .object({
      syncedAt: z.iso.datetime().nullable(),
      conversationLinked: z.boolean(),
      advisorName: z.string().nullable().default(null),
    })
    .optional(),
  updatedAt: z.iso.datetime(),
});
export type LeadStatusResponse = z.infer<typeof LeadStatusResponseSchema>;

export const LeadFeedbackSourceSchema = z.enum([
  'facebook',
  'instagram',
  'tiktok',
  'google',
  'youtube',
  'recomendacion',
  'colegio',
  'otro',
]);
export type LeadFeedbackSource = z.infer<typeof LeadFeedbackSourceSchema>;

/** POST /api/v1/leads/{leadId}/feedback — "¿Cómo nos conociste?" (opcional, requiere `x-lead-token`). */
export const LeadFeedbackRequestSchema = z.object({
  source: LeadFeedbackSourceSchema,
  detail: z.string().trim().max(120).optional(),
});
export type LeadFeedbackRequest = z.infer<typeof LeadFeedbackRequestSchema>;

export const TrackingEventNameSchema = z.enum([
  'landing_viewed',
  'promotion_selected',
  'form_started',
  'form_submitted',
  'whatsapp_opened',
  'experiment_exposed',
  'faq_opened',
  'call_clicked',
  'floating_cta_clicked',
  'specialty_viewed',
]);
export type TrackingEventName = z.infer<typeof TrackingEventNameSchema>;

/** POST /api/v1/tracking/events: solo eventos autorizados, sin datos personales. */
export const TrackingEventRequestSchema = z.object({
  brand: BrandSchema,
  event: TrackingEventNameSchema,
  sessionId: z.string().min(8).max(64),
  leadId: z.uuid().optional(),
  promotionId: SlugSchema.optional(),
  specialtyId: SlugSchema.optional(),
  experiment: ExperimentExposureSchema.optional(),
  attribution: AttributionSchema.optional(),
  occurredAt: z.iso.datetime().optional(),
});
export type TrackingEventRequest = z.infer<typeof TrackingEventRequestSchema>;
