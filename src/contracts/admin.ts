import { z } from 'zod';
import { BrandSchema, CampusSchema, MoneySchema, SlugSchema } from './common';
import {
  ComplaintKindSchema,
  IdentityDocumentTypeSchema,
  PrivacyRequestTypeSchema,
} from './compliance';
import { AttributionSchema, LeadFeedbackSourceSchema, LeadStatusSchema } from './leads';
import {
  PromotionBundleSchema,
  PromotionIconSchema,
  PromotionSchema,
  SpecialtySchema,
  SpecialtyTrackSchema,
} from './promotions';

/*
 * Contratos de administración. Se exponen SOLO en rutas /internal/admin/* de
 * cada servicio, protegidas por token de servicio (Authorization: Bearer) y
 * con la cabecera `x-actor` (correo del usuario del panel) para auditoría.
 * Los consume apps/admin-web desde su servidor, nunca desde el navegador.
 */

export const ACTOR_HEADER = 'x-actor';
export const LEAD_TOKEN_HEADER = 'x-lead-token';

export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const paginated = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
  });

/* ----------------------------- promotions-service ------------------------ */

export const AdminPromotionInputSchema = z.object({
  id: SlugSchema,
  brand: BrandSchema,
  name: z.string().trim().min(2).max(40),
  headline: z.string().trim().min(2).max(20),
  price: MoneySchema,
  listPrice: MoneySchema.optional(),
  bundle: PromotionBundleSchema,
  featured: z.boolean().default(false),
  icon: PromotionIconSchema.default('layers'),
  validFrom: z.iso.datetime(),
  validUntil: z.iso.datetime().nullable(),
  campaignId: SlugSchema.nullable().default(null),
  sortOrder: z.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});
export type AdminPromotionInput = z.infer<typeof AdminPromotionInputSchema>;

export const AdminPromotionSchema = PromotionSchema.extend({
  active: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type AdminPromotion = z.infer<typeof AdminPromotionSchema>;

export const AdminPromotionListResponseSchema = z.object({ items: z.array(AdminPromotionSchema) });

export const AdminSpecialtyInputSchema = SpecialtySchema.omit({ brand: true }).extend({
  brand: BrandSchema,
  track: SpecialtyTrackSchema,
  active: z.boolean().default(true),
});
export type AdminSpecialtyInput = z.infer<typeof AdminSpecialtyInputSchema>;

/* -------------------------------- leads-service -------------------------- */

export const AdminLeadListQuerySchema = PaginationQuerySchema.extend({
  brand: BrandSchema.optional(),
  status: LeadStatusSchema.optional(),
  promotionId: SlugSchema.optional(),
  campus: CampusSchema.optional(),
  utmCampaign: z.string().max(150).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  /** Búsqueda por referencia exacta (SIS-XXXXX) o por correo/teléfono exactos (se comparan hashes). */
  q: z.string().trim().max(160).optional(),
});
export type AdminLeadListQuery = z.infer<typeof AdminLeadListQuerySchema>;

export const AdminLeadSchema = z.object({
  leadId: z.uuid(),
  reference: z.string(),
  brand: BrandSchema,
  createdAt: z.iso.datetime(),
  fullName: z.string(),
  phone: z.string(),
  email: z.string(),
  campus: CampusSchema,
  promotion: z.object({ id: SlugSchema, name: z.string(), headline: z.string() }),
  specialtyIds: z.array(SlugSchema),
  status: LeadStatusSchema,
  crm: z.object({
    contactId: z.string().nullable(),
    conversationId: z.string().nullable(),
    syncedAt: z.iso.datetime().nullable(),
    conversationLinkedAt: z.iso.datetime().nullable(),
  }),
  attribution: AttributionSchema.nullable(),
  consent: z.object({ marketingAccepted: z.boolean(), privacyVersion: z.string() }),
  feedbackSource: LeadFeedbackSourceSchema.nullable(),
  anonymized: z.boolean(),
});
export type AdminLead = z.infer<typeof AdminLeadSchema>;

export const AdminLeadListResponseSchema = paginated(AdminLeadSchema);
export type AdminLeadListResponse = z.infer<typeof AdminLeadListResponseSchema>;

export const FunnelStepKeySchema = z.enum([
  'landing_viewed',
  'promotion_selected',
  'form_started',
  'form_submitted',
  'whatsapp_opened',
  'crm_synced',
  'conversation_linked',
]);

export const FunnelReportQuerySchema = z.object({
  brand: BrandSchema.default('sis'),
  from: z.iso.datetime(),
  to: z.iso.datetime(),
});
export type FunnelReportQuery = z.infer<typeof FunnelReportQuerySchema>;

export const FunnelReportSchema = z.object({
  brand: BrandSchema,
  from: z.iso.datetime(),
  to: z.iso.datetime(),
  /** Sesiones únicas por paso (eventos) y leads para los pasos de CRM. */
  steps: z.array(z.object({ key: FunnelStepKeySchema, label: z.string(), count: z.number().int() })),
  byPromotion: z.array(
    z.object({ promotionId: SlugSchema, leads: z.number().int(), synced: z.number().int(), linked: z.number().int() }),
  ),
  byCampaign: z.array(z.object({ utmCampaign: z.string(), utmSource: z.string().nullable(), leads: z.number().int() })),
  byFeedbackSource: z.array(z.object({ source: LeadFeedbackSourceSchema, leads: z.number().int() })),
  experiments: z.array(
    z.object({
      id: SlugSchema,
      variant: z.string(),
      exposures: z.number().int(),
      submissions: z.number().int(),
    }),
  ),
  daily: z.array(z.object({ date: z.string(), leads: z.number().int(), duplicates: z.number().int() })),
});
export type FunnelReport = z.infer<typeof FunnelReportSchema>;

export const DailyReportSchema = z.object({
  brand: BrandSchema,
  date: z.string().describe('YYYY-MM-DD en America/Lima'),
  leads: z.number().int(),
  duplicates: z.number().int(),
  crmSynced: z.number().int(),
  crmFailed: z.number().int(),
  conversationsLinked: z.number().int(),
  topPromotion: z.string().nullable(),
  topCampaign: z.string().nullable(),
});
export type DailyReport = z.infer<typeof DailyReportSchema>;

export const ComplaintStatusSchema = z.enum(['received', 'in_progress', 'answered']);

export const AdminComplaintSchema = z.object({
  complaintId: z.uuid(),
  code: z.string(),
  brand: BrandSchema,
  kind: ComplaintKindSchema,
  status: ComplaintStatusSchema,
  consumer: z.object({
    fullName: z.string(),
    documentType: IdentityDocumentTypeSchema,
    documentNumber: z.string(),
    email: z.string(),
    phone: z.string(),
  }),
  itemDescription: z.string(),
  detail: z.string(),
  request: z.string(),
  receivedAt: z.iso.datetime(),
  responseDueBy: z.iso.datetime(),
  response: z.string().nullable(),
  respondedAt: z.iso.datetime().nullable(),
});
export type AdminComplaint = z.infer<typeof AdminComplaintSchema>;

export const AdminComplaintResponseInputSchema = z.object({ response: z.string().trim().min(10).max(4000) });

export const PrivacyRequestStatusSchema = z.enum(['received', 'in_progress', 'resolved', 'rejected']);

export const AdminPrivacyRequestSchema = z.object({
  requestId: z.uuid(),
  code: z.string(),
  brand: BrandSchema,
  type: PrivacyRequestTypeSchema,
  status: PrivacyRequestStatusSchema,
  fullName: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  reference: z.string().nullable(),
  detail: z.string().nullable(),
  receivedAt: z.iso.datetime(),
  responseDueBy: z.iso.datetime(),
  resolution: z.string().nullable(),
  resolvedAt: z.iso.datetime().nullable(),
});
export type AdminPrivacyRequest = z.infer<typeof AdminPrivacyRequestSchema>;

export const AdminPrivacyResolutionInputSchema = z.object({
  status: z.enum(['in_progress', 'resolved', 'rejected']),
  resolution: z.string().trim().min(5).max(4000),
  /** Si true y el tipo es cancelación/revocación, anonimiza los leads asociados. */
  anonymizeLeads: z.boolean().default(false),
});

/* ----------------------------- crm-bridge-service ------------------------ */

export const IntegrationSummarySchema = z.object({
  jobs: z.object({
    pending: z.number().int(),
    succeeded: z.number().int(),
    failed: z.number().int(),
    dead: z.number().int(),
  }),
  queues: z.array(z.object({ name: z.string(), messages: z.number().int(), consumers: z.number().int() })),
  lastSyncAt: z.iso.datetime().nullable(),
  chatwootConfigured: z.boolean(),
});
export type IntegrationSummary = z.infer<typeof IntegrationSummarySchema>;

/* --------------------------------- auditoría ----------------------------- */

export const AuditEntrySchema = z.object({
  id: z.uuid(),
  at: z.iso.datetime(),
  caller: z.string().describe('Servicio que llamó (admin-web, leads-service...)'),
  actor: z.string().nullable().describe('Persona (correo) si la acción vino del panel'),
  action: z.string(),
  target: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;
