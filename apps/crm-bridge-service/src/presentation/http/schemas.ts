import { AuditEntrySchema } from '@capsur/api-contracts';
import { z } from 'zod';
import { SYNC_JOB_STATUSES } from '../../domain/sync-job';

/**
 * Esquemas HTTP propios del servicio (los compartidos viven en `@capsur/api-contracts`).
 * Los usan los controladores para validar y `openapi.ts` para documentar (B14).
 */
export const RetryRequestSchema = z.object({
  leadId: z.uuid().optional(),
  status: z.enum(['FAILED', 'DEAD']).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});
export type RetryRequest = z.infer<typeof RetryRequestSchema>;

export const RetryResultSchema = z.object({
  attempted: z.number().int(),
  succeeded: z.number().int(),
  failed: z.number().int(),
});

export const JobsQuerySchema = z.object({
  status: z.enum(SYNC_JOB_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
export type JobsQuery = z.infer<typeof JobsQuerySchema>;

export const SyncJobSummarySchema = z.object({
  leadId: z.string(),
  reference: z.string(),
  status: z.enum(SYNC_JOB_STATUSES),
  attempts: z.number().int(),
  lastError: z.string().nullable(),
  updatedAt: z.iso.datetime(),
});

export const JobsResponseSchema = z.object({ items: z.array(SyncJobSummarySchema) });

export const AuditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
export type AuditQuery = z.infer<typeof AuditQuerySchema>;

export const AuditListResponseSchema = z.object({ items: z.array(AuditEntrySchema) });

export const WebhookAcceptedSchema = z.object({
  accepted: z.literal(true),
  outcome: z.enum(['linked', 'ignored', 'unmatched', 'error']),
  reason: z.string().optional(),
});
export type WebhookAccepted = z.infer<typeof WebhookAcceptedSchema>;
