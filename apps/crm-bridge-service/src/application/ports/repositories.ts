import { type LeadCreatedPayload } from '@capsur/api-contracts';
import { type ContactLink, type ConversationLinkPatch, type NewContactLink } from '../../domain/contact-link';
import { type IntegrationOperation } from '../../domain/integration-error';
import { type AttemptStatus, type SyncJob, type SyncJobCounts, type SyncJobStatus, type SyncJobSummary } from '../../domain/sync-job';

export interface ContactLinkRepository {
  findByLeadId(leadId: string): Promise<ContactLink | null>;
  findByReference(reference: string): Promise<ContactLink | null>;
  findByCrmContactId(crmContactId: string): Promise<ContactLink | null>;
  /** Crea o actualiza por leadId. Conserva la conversación ya enlazada si existe. */
  upsert(link: NewContactLink): Promise<ContactLink>;
  markConversationLinked(leadId: string, patch: ConversationLinkPatch): Promise<ContactLink>;
  /**
   * Reclama de forma atómica el envío de la respuesta automática (A8):
   * `true` solo para la primera llamada por vínculo.
   */
  claimAutoReply(leadId: string, at: Date): Promise<boolean>;
  /** Fecha de la última sincronización correcta (A27). */
  latestSyncedAt(): Promise<Date | null>;
}

export interface UpsertSyncJobInput {
  leadId: string;
  eventId: string;
  reference: string;
  payload: LeadCreatedPayload;
  attempt: number;
}

export interface SyncJobPatch {
  status: SyncJobStatus;
  attempts?: number;
  lastError?: string | null;
}

export interface SyncJobFilter {
  statuses?: SyncJobStatus[];
  limit: number;
}

export interface SyncJobRepository {
  /** Incluye el payload descifrado (null si se anonimizó). */
  findByLeadId(leadId: string): Promise<SyncJob | null>;
  /** Crea el trabajo en PENDING o lo vuelve a PENDING con el nuevo número de intento (payload cifrado). */
  upsertPending(input: UpsertSyncJobInput): Promise<SyncJob>;
  update(leadId: string, patch: SyncJobPatch): Promise<void>;
  /** Con payload descifrado (reproceso). */
  list(filter: SyncJobFilter): Promise<SyncJob[]>;
  /** Sin payload ni descifrado (endpoints internos, B12). */
  listSummaries(filter: SyncJobFilter): Promise<SyncJobSummary[]>;
  countByStatus(): Promise<SyncJobCounts>;
}

export interface IntegrationAttemptRecord {
  leadId: string;
  eventId: string;
  attempt: number;
  operation: IntegrationOperation;
  status: AttemptStatus;
  httpStatus: number | null;
  error: string | null;
  startedAt: Date;
  finishedAt: Date;
}

export interface AttemptRepository {
  record(attempt: IntegrationAttemptRecord): Promise<void>;
}

export interface ProcessedEventRepository {
  has(eventId: string): Promise<boolean>;
  markProcessed(eventId: string, name: string, processedAt: Date): Promise<void>;
}

export type WebhookOutcome = 'linked' | 'ignored' | 'unmatched' | 'error';

export interface NewWebhookEvent {
  dedupeKey: string;
  eventType: string;
  conversationId: string | null;
  contactId: string | null;
  payload: unknown;
  signatureValid: boolean;
  receivedAt: Date;
}

export interface WebhookEventRepository {
  /** Inserta el evento; devuelve false si ya existía uno con la misma dedupeKey. */
  createIfAbsent(event: NewWebhookEvent): Promise<boolean>;
  finish(dedupeKey: string, outcome: WebhookOutcome, processedAt: Date): Promise<void>;
}

/* ------------------------------ A6 seguimientos ------------------------------ */

export type FollowupStatus = 'PENDING' | 'PROCESSING' | 'SENT' | 'FAILED' | 'SKIPPED';

export interface FollowupTask {
  leadId: string;
  attempts: number;
}

export interface FollowupResult {
  status: Extract<FollowupStatus, 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED'>;
  attempts: number;
  crmConversationId?: string | null;
  templateName?: string | null;
  /** Motivo (SKIPPED) o error (FAILED/PENDING); sin datos personales. */
  reason?: string | null;
  /** Nueva fecha de vencimiento si vuelve a PENDING. */
  dueAt?: Date;
  sentAt?: Date | null;
}

export interface FollowupRepository {
  /** Programa el seguimiento; no hace nada si el lead ya tiene uno (una vez por lead). */
  schedule(leadId: string, dueAt: Date): Promise<void>;
  /**
   * Reclama hasta `limit` seguimientos vencidos con `SELECT … FOR UPDATE SKIP LOCKED`
   * (seguro con varias réplicas) y los pasa a PROCESSING con un arrendamiento `leaseMs`.
   */
  claimDue(now: Date, limit: number, leaseMs: number): Promise<FollowupTask[]>;
  complete(leadId: string, result: FollowupResult): Promise<void>;
  /** `true` si la conversación la abrió un seguimiento con plantilla. */
  isFollowupConversation(conversationId: string): Promise<boolean>;
}

/* ---------------------------- A17 Meta Conversions --------------------------- */

export type MetaCapiStatus = 'SENT' | 'FAILED' | 'SKIPPED';

export interface MetaCapiRecord {
  leadId: string;
  eventId: string;
  status: MetaCapiStatus;
  attempts: number;
  fbtraceId: string | null;
  lastError: string | null;
  sentAt: Date | null;
}

export interface MetaCapiEventRepository {
  findStatus(leadId: string): Promise<MetaCapiStatus | null>;
  save(record: MetaCapiRecord): Promise<void>;
}

/* ------------------------------ C9 anonimización ----------------------------- */

export interface ErasureTarget {
  leadId: string;
  crmContactId: string | null;
  crmConversationId: string | null;
}

export interface ErasureResult {
  syncJobs: number;
  contactLinks: number;
  webhookEvents: number;
  attempts: number;
  followups: number;
  metaCapiEvents: number;
}

/** Borra datos personales de todas las tablas del servicio en una transacción. Idempotente. */
export interface PersonalDataEraser {
  erase(target: ErasureTarget, at: Date): Promise<ErasureResult>;
}
