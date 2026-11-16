import {
  type Campus,
  type CrmContactSyncedPayload,
  type CrmSyncFailedPayload,
  EventNames,
  type LeadCreatedPayload,
} from '@capsur/api-contracts';
import { type ContactLink } from '../../domain/contact-link';
import { IntegrationError } from '../../domain/integration-error';
import { buildContactAttributes, buildLeadLabels, mergeLabels } from '../../domain/lead-labels';
import { crmEnvelope } from '../events/envelope';
import { type ChatwootContact, type ChatwootGateway } from '../ports/chatwoot-gateway';
import { type Clock } from '../ports/clock';
import { type EventPublisher } from '../ports/event-publisher';
import { type LoggerPort, noopLogger } from '../ports/logger';
import {
  type AttemptRepository,
  type ContactLinkRepository,
  type FollowupRepository,
  type ProcessedEventRepository,
  type SyncJobRepository,
} from '../ports/repositories';

export interface SyncLeadInput {
  eventId: string;
  payload: LeadCreatedPayload;
  /** Número de intento (1 = primera entrega). */
  attempt: number;
  /** Al alcanzarlo, un fallo reintentable marca el trabajo como DEAD en lugar de relanzar. */
  maxAttempts: number;
  /** Ignora `processed_events` (reproceso manual). */
  force?: boolean;
}

export type SyncLeadResult =
  | { status: 'synced'; link: ContactLink; created: boolean }
  | { status: 'skipped'; reason: 'already_processed' | 'anonymized' }
  | { status: 'failed'; reason: string }
  | { status: 'dead'; reason: string };

export interface SyncLeadDependencies {
  gateway: ChatwootGateway;
  contactLinks: ContactLinkRepository;
  syncJobs: SyncJobRepository;
  attempts: AttemptRepository;
  processedEvents: ProcessedEventRepository;
  publisher: EventPublisher;
  clock: Clock;
  crmAccountId: string;
  /** Bandeja de Chatwoot de la sede del lead (A4). */
  inboxForCampus: (campus: Campus) => number;
  /** Seguimiento con plantilla (A6): solo si está activado. */
  followup?: { repository: FollowupRepository; afterHours: number } | null;
  logger?: LoggerPort;
}

/**
 * Sincroniza un lead con Chatwoot: busca o crea el contacto (en la bandeja de su sede),
 * aplica etiquetas (incluida `sede-<campus>`), guarda el vínculo y publica
 * `crm.contact.synced.v1`.
 *
 * Contrato de errores:
 * - fallo permanente → `sync_jobs` FAILED, `crm.sync.failed.v1`, devuelve `failed` (el consumidor hace ack);
 * - fallo reintentable con intentos restantes → relanza `IntegrationError` (el consumidor hace nack);
 * - fallo reintentable sin intentos restantes → `sync_jobs` DEAD, `crm.sync.failed.v1`, devuelve `dead`.
 */
export class SyncLeadToChatwoot {
  private readonly logger: LoggerPort;

  constructor(private readonly deps: SyncLeadDependencies) {
    this.logger = deps.logger ?? noopLogger;
  }

  async execute(input: SyncLeadInput): Promise<SyncLeadResult> {
    const { eventId, payload, attempt } = input;
    const { leadId, reference } = payload;

    if (!input.force && (await this.deps.processedEvents.has(eventId))) {
      this.logger.info('Evento ya procesado; se omite', { eventId, leadId });
      return { status: 'skipped', reason: 'already_processed' };
    }

    const existingJob = await this.deps.syncJobs.findByLeadId(leadId);
    if (existingJob?.anonymizedAt) {
      // C9: un lead anonimizado no se vuelve a enviar a Chatwoot (p. ej. reentrega tardía).
      this.logger.info('Lead anonimizado; no se sincroniza', { eventId, leadId });
      return { status: 'skipped', reason: 'anonymized' };
    }

    await this.deps.syncJobs.upsertPending({ leadId, eventId, reference, payload, attempt });
    const startedAt = this.deps.clock.now();

    try {
      const { contact, created } = await this.findOrSyncContact(payload);
      const wanted = buildLeadLabels(payload);
      const existing = await this.deps.gateway.getContactLabels(contact.id);
      const labels = mergeLabels(existing, wanted);
      await this.deps.gateway.setContactLabels(contact.id, labels);

      const syncedAt = this.deps.clock.now();
      const link = await this.deps.contactLinks.upsert({
        leadId,
        reference,
        crmAccountId: this.deps.crmAccountId,
        crmContactId: contact.id,
        labels,
        syncedAt,
      });

      await this.deps.attempts.record({
        leadId,
        eventId,
        attempt,
        operation: 'sync_contact',
        status: 'SUCCESS',
        httpStatus: null,
        error: null,
        startedAt,
        finishedAt: syncedAt,
      });
      await this.deps.syncJobs.update(leadId, { status: 'SUCCEEDED', attempts: attempt, lastError: null });
      await this.deps.processedEvents.markProcessed(eventId, EventNames.LeadCreated, syncedAt);
      await this.scheduleFollowup(link, syncedAt);

      const synced: CrmContactSyncedPayload = {
        leadId,
        reference,
        crmContactId: contact.id,
        crmAccountId: this.deps.crmAccountId,
        labels,
        syncedAt: syncedAt.toISOString(),
      };
      await this.deps.publisher.publish(crmEnvelope(EventNames.CrmContactSynced, leadId, synced, syncedAt));

      this.logger.info('Lead sincronizado con Chatwoot', { leadId, reference, crmContactId: contact.id, created, attempt });
      return { status: 'synced', link, created };
    } catch (rawError) {
      const error = IntegrationError.classify(rawError);
      const finishedAt = this.deps.clock.now();

      if (error.code === 'CHATWOOT_NOT_CONFIGURED') {
        this.logger.warn(
          'Chatwoot no está configurado (CHATWOOT_BASE_URL o CHATWOOT_API_ACCESS_TOKEN con valores de ejemplo); el lead se reintentará',
          { leadId, reference, attempt },
        );
      }

      await this.deps.attempts.record({
        leadId,
        eventId,
        attempt,
        operation: 'sync_contact',
        status: error.retryable ? 'RETRYABLE_FAILURE' : 'PERMANENT_FAILURE',
        httpStatus: error.httpStatus ?? null,
        error: error.message,
        startedAt,
        finishedAt,
      });

      if (!error.retryable) {
        await this.deps.syncJobs.update(leadId, { status: 'FAILED', attempts: attempt, lastError: error.message });
        await this.publishFailed(payload, attempt, error.message, finishedAt);
        this.logger.error('Fallo permanente al sincronizar el lead', {
          leadId,
          reference,
          attempt,
          httpStatus: error.httpStatus,
          error: error.message,
        });
        return { status: 'failed', reason: error.message };
      }

      if (attempt >= input.maxAttempts) {
        await this.deps.syncJobs.update(leadId, { status: 'DEAD', attempts: attempt, lastError: error.message });
        await this.publishFailed(payload, attempt, error.message, finishedAt);
        this.logger.error('Intentos agotados; el lead pasa a DEAD', { leadId, reference, attempt, error: error.message });
        return { status: 'dead', reason: error.message };
      }

      await this.deps.syncJobs.update(leadId, { status: 'PENDING', attempts: attempt, lastError: error.message });
      this.logger.warn('Fallo reintentable al sincronizar el lead', {
        leadId,
        reference,
        attempt,
        httpStatus: error.httpStatus,
        error: error.message,
      });
      throw error;
    }
  }

  private async findOrSyncContact(payload: LeadCreatedPayload): Promise<{ contact: ChatwootContact; created: boolean }> {
    const attributes = buildContactAttributes(payload);
    const existing = await this.deps.gateway.findContactByPhone(payload.phone);
    if (existing) {
      const contact = await this.deps.gateway.updateContact(existing.id, {
        name: payload.fullName,
        email: payload.email || null,
        customAttributes: { ...existing.customAttributes, ...attributes },
      });
      return { contact, created: false };
    }
    const contact = await this.deps.gateway.createContact({
      inboxId: this.deps.inboxForCampus(payload.campus),
      name: payload.fullName,
      phoneNumber: payload.phone,
      email: payload.email || null,
      customAttributes: attributes,
    });
    return { contact, created: true };
  }

  /** A6: programa la plantilla de seguimiento si aún no hay conversación vinculada. */
  private async scheduleFollowup(link: ContactLink, syncedAt: Date): Promise<void> {
    const followup = this.deps.followup;
    if (!followup || link.crmConversationId) {
      return;
    }
    const dueAt = new Date(syncedAt.getTime() + followup.afterHours * 60 * 60 * 1000);
    try {
      await followup.repository.schedule(link.leadId, dueAt);
    } catch (error) {
      // No bloquea la sincronización: el seguimiento es opcional.
      this.logger.warn('No se pudo programar el seguimiento con plantilla', {
        leadId: link.leadId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async publishFailed(payload: LeadCreatedPayload, attempts: number, reason: string, failedAt: Date): Promise<void> {
    const failed: CrmSyncFailedPayload = {
      leadId: payload.leadId,
      reference: payload.reference,
      attempts,
      reason,
      failedAt: failedAt.toISOString(),
    };
    try {
      await this.deps.publisher.publish(crmEnvelope(EventNames.CrmSyncFailed, payload.leadId, failed, failedAt));
    } catch (error) {
      this.logger.error('No se pudo publicar crm.sync.failed.v1', {
        leadId: payload.leadId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
