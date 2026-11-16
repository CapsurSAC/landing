import { z } from 'zod';
import { BrandSchema, CampusSchema, E164PhoneSchema, SlugSchema } from './common';
import { AttributionSchema, LeadFeedbackSourceSchema } from './leads';

/**
 * Eventos de integración versionados. Los nombres son también las routing keys
 * en RabbitMQ (exchange `capsur.events`, tipo topic).
 */
export const EventNames = {
  LeadCreated: 'lead.created.v1',
  LeadFeedbackReceived: 'lead.feedback.v1',
  LeadAnonymized: 'lead.anonymized.v1',
  CrmContactSynced: 'crm.contact.synced.v1',
  CrmConversationLinked: 'crm.conversation.linked.v1',
  CrmSyncFailed: 'crm.sync.failed.v1',
} as const;
export type EventName = (typeof EventNames)[keyof typeof EventNames];

export const EXCHANGE_EVENTS = 'capsur.events';
export const EXCHANGE_RETRY = 'capsur.events.retry';
export const EXCHANGE_DLX = 'capsur.events.dlx';

/**
 * Colas declaradas en infrastructure/rabbitmq/definitions.json. Los servicios
 * solo hacen `checkQueue`; la topología la gobierna infraestructura.
 *
 * Patrón de reintento por cola (para las colas nuevas): la cola principal
 * hace dead-letter al exchange por defecto ("") con routing key
 * `<cola>.retry`; la cola `.retry` tiene TTL y hace dead-letter de vuelta al
 * exchange por defecto con routing key `<cola>`. Así el reintento vuelve solo
 * a esa cola y no se reparte a otros consumidores del mismo evento.
 */
export const Queues = {
  CrmBridgeLeadCreated: 'crm-bridge.lead-created',
  CrmBridgeLeadCreatedRetry: 'crm-bridge.lead-created.retry',
  CrmBridgeLeadCreatedDlq: 'crm-bridge.lead-created.dlq',
  CrmBridgeLeadFeedback: 'crm-bridge.lead-feedback',
  CrmBridgeLeadAnonymized: 'crm-bridge.lead-anonymized',
  CrmBridgeMetaCapi: 'crm-bridge.meta-capi',
  CrmBridgeMetaCapiRetry: 'crm-bridge.meta-capi.retry',
  CrmBridgeMetaCapiDlq: 'crm-bridge.meta-capi.dlq',
  LeadsCrmStatus: 'leads.crm-status',
} as const;

export const EventEnvelopeSchema = z.object({
  id: z.uuid().describe('Identificador único del evento; los consumidores lo usan para idempotencia'),
  name: z.string(),
  version: z.number().int().min(1),
  occurredAt: z.iso.datetime(),
  producer: z.string(),
  correlationId: z.string().describe('Normalmente el leadId'),
  payload: z.unknown(),
});
export type EventEnvelope<T = unknown> = Omit<z.infer<typeof EventEnvelopeSchema>, 'payload'> & {
  payload: T;
};

export const LeadCreatedPayloadSchema = z.object({
  leadId: z.uuid(),
  reference: z.string(),
  brand: BrandSchema,
  fullName: z.string(),
  phone: E164PhoneSchema,
  email: z.string(),
  campus: CampusSchema.default('tacna'),
  promotion: z.object({
    id: SlugSchema,
    name: z.string(),
    headline: z.string().optional(),
    campaignId: SlugSchema.nullable(),
    /** Precio de referencia en céntimos (para eventos de conversión). */
    priceAmount: z.number().int().nonnegative().optional(),
  }),
  specialties: z.array(z.object({ id: SlugSchema, name: z.string() })).default([]),
  consent: z.object({
    contactAccepted: z.boolean(),
    marketingAccepted: z.boolean(),
    privacyVersion: z.string(),
    acceptedAt: z.iso.datetime(),
  }),
  attribution: AttributionSchema.optional(),
  /** Datos técnicos para Meta Conversions API; solo se usan si marketingAccepted. */
  client: z
    .object({
      ipAddress: z.string().max(64).optional(),
      userAgent: z.string().max(512).optional(),
      fbc: z.string().max(256).optional(),
      fbp: z.string().max(256).optional(),
      eventSourceUrl: z.string().max(500).optional(),
    })
    .optional(),
  createdAt: z.iso.datetime(),
});
export type LeadCreatedPayload = z.infer<typeof LeadCreatedPayloadSchema>;

export const LeadFeedbackPayloadSchema = z.object({
  leadId: z.uuid(),
  reference: z.string(),
  source: LeadFeedbackSourceSchema,
  detail: z.string().nullable(),
  receivedAt: z.iso.datetime(),
});
export type LeadFeedbackPayload = z.infer<typeof LeadFeedbackPayloadSchema>;

export const LeadAnonymizedPayloadSchema = z.object({
  leadId: z.uuid(),
  reference: z.string(),
  reason: z.enum(['retention', 'arco_request', 'admin']),
  /** Si true, crm-bridge también elimina el contacto en Chatwoot. */
  deleteCrmContact: z.boolean().default(false),
  anonymizedAt: z.iso.datetime(),
});
export type LeadAnonymizedPayload = z.infer<typeof LeadAnonymizedPayloadSchema>;

export const CrmContactSyncedPayloadSchema = z.object({
  leadId: z.uuid(),
  reference: z.string(),
  crmContactId: z.string(),
  crmAccountId: z.string(),
  labels: z.array(z.string()),
  syncedAt: z.iso.datetime(),
});
export type CrmContactSyncedPayload = z.infer<typeof CrmContactSyncedPayloadSchema>;

export const CrmConversationLinkedPayloadSchema = z.object({
  leadId: z.uuid(),
  reference: z.string(),
  crmContactId: z.string(),
  crmConversationId: z.string(),
  inboxId: z.string(),
  assignedTo: z.string().nullable(),
  /** Nombre visible del asesor asignado (para mostrarlo al usuario). */
  assignedToName: z.string().nullable().default(null),
  linkedAt: z.iso.datetime(),
});
export type CrmConversationLinkedPayload = z.infer<typeof CrmConversationLinkedPayloadSchema>;

export const CrmSyncFailedPayloadSchema = z.object({
  leadId: z.uuid(),
  reference: z.string(),
  attempts: z.number().int(),
  reason: z.string(),
  failedAt: z.iso.datetime(),
});
export type CrmSyncFailedPayload = z.infer<typeof CrmSyncFailedPayloadSchema>;
