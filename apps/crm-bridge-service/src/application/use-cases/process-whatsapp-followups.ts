import { type Campus } from '@capsur/api-contracts';
import { buildFollowupTemplateMessage, FOLLOWUP_MAX_ATTEMPTS } from '../../domain/followup-template';
import { IntegrationError } from '../../domain/integration-error';
import { type ChatwootGateway } from '../ports/chatwoot-gateway';
import { type Clock } from '../ports/clock';
import { type LoggerPort, noopLogger } from '../ports/logger';
import {
  type AttemptRepository,
  type ContactLinkRepository,
  type FollowupRepository,
  type FollowupResult,
  type FollowupTask,
  type SyncJobRepository,
} from '../ports/repositories';

/** Seguimientos reclamados por ejecución. */
export const FOLLOWUP_BATCH_SIZE = 20;
/** Arrendamiento del candado: si la réplica muere, la fila vuelve a estar disponible. */
export const FOLLOWUP_LEASE_MS = 10 * 60 * 1000;
/** Espera antes de reintentar un fallo reintentable. */
export const FOLLOWUP_RETRY_DELAY_MS = 15 * 60 * 1000;

export interface FollowupRunResult {
  claimed: number;
  sent: number;
  skipped: number;
  failed: number;
  rescheduled: number;
}

export interface ProcessFollowupsDependencies {
  gateway: ChatwootGateway;
  followups: FollowupRepository;
  contactLinks: ContactLinkRepository;
  syncJobs: SyncJobRepository;
  attempts: AttemptRepository;
  clock: Clock;
  template: { name: string; language: string };
  inboxForCampus: (campus: Campus) => number;
  logger?: LoggerPort;
}

/**
 * A6: para los contactos sincronizados que no abrieron conversación tras
 * `WHATSAPP_FOLLOWUP_AFTER_HOURS`, crea en Chatwoot una conversación iniciada con la
 * plantilla aprobada. Una sola vez por lead (la fila de `whatsapp_followups` es única y
 * termina en SENT, SKIPPED o FAILED). Seguro con varias réplicas: `claimDue` usa
 * `SELECT … FOR UPDATE SKIP LOCKED`.
 */
export class ProcessWhatsappFollowups {
  private readonly logger: LoggerPort;

  constructor(private readonly deps: ProcessFollowupsDependencies) {
    this.logger = deps.logger ?? noopLogger;
  }

  async execute(): Promise<FollowupRunResult> {
    const now = this.deps.clock.now();
    const tasks = await this.deps.followups.claimDue(now, FOLLOWUP_BATCH_SIZE, FOLLOWUP_LEASE_MS);
    const result: FollowupRunResult = { claimed: tasks.length, sent: 0, skipped: 0, failed: 0, rescheduled: 0 };
    for (const task of tasks) {
      const outcome = await this.processOne(task);
      await this.deps.followups.complete(task.leadId, outcome);
      if (outcome.status === 'SENT') result.sent += 1;
      else if (outcome.status === 'SKIPPED') result.skipped += 1;
      else if (outcome.status === 'FAILED') result.failed += 1;
      else result.rescheduled += 1;
    }
    if (tasks.length > 0) {
      this.logger.info('Seguimientos con plantilla procesados', { ...result });
    }
    return result;
  }

  private async processOne(task: FollowupTask): Promise<FollowupResult> {
    const attempts = task.attempts + 1;
    const link = await this.deps.contactLinks.findByLeadId(task.leadId);
    if (!link || link.anonymizedAt) {
      return { status: 'SKIPPED', attempts: task.attempts, reason: link ? 'anonymized' : 'contact_not_synced' };
    }
    if (link.crmConversationId) {
      // El contacto ya escribió: no hace falta la plantilla.
      return { status: 'SKIPPED', attempts: task.attempts, reason: 'conversation_exists' };
    }
    const job = await this.deps.syncJobs.findByLeadId(task.leadId);
    if (!job?.payload) {
      return { status: 'SKIPPED', attempts: task.attempts, reason: 'payload_unavailable' };
    }

    const message = buildFollowupTemplateMessage(job.payload, this.deps.template);
    const startedAt = this.deps.clock.now();
    try {
      const { conversationId } = await this.deps.gateway.createTemplateConversation({
        inboxId: this.deps.inboxForCampus(job.payload.campus),
        contactId: link.crmContactId,
        content: message.content,
        template: message.templateParams,
      });
      await this.record(task.leadId, attempts, startedAt, null);
      this.logger.info('Plantilla de seguimiento enviada', { leadId: task.leadId, conversationId });
      return {
        status: 'SENT',
        attempts,
        crmConversationId: conversationId,
        templateName: this.deps.template.name,
        sentAt: this.deps.clock.now(),
      };
    } catch (rawError) {
      const error = IntegrationError.classify(rawError);
      await this.record(task.leadId, attempts, startedAt, error);
      if (error.retryable && attempts < FOLLOWUP_MAX_ATTEMPTS) {
        this.logger.warn('Fallo reintentable enviando la plantilla de seguimiento', { leadId: task.leadId, attempts, error: error.message });
        return {
          status: 'PENDING',
          attempts,
          reason: error.message,
          dueAt: new Date(this.deps.clock.now().getTime() + FOLLOWUP_RETRY_DELAY_MS),
        };
      }
      this.logger.error('No se pudo enviar la plantilla de seguimiento', { leadId: task.leadId, attempts, error: error.message });
      return { status: 'FAILED', attempts, templateName: this.deps.template.name, reason: error.message };
    }
  }

  private async record(leadId: string, attempt: number, startedAt: Date, error: IntegrationError | null): Promise<void> {
    await this.deps.attempts.record({
      leadId,
      eventId: `followup:${leadId}`,
      attempt,
      operation: 'followup',
      status: error ? (error.retryable ? 'RETRYABLE_FAILURE' : 'PERMANENT_FAILURE') : 'SUCCESS',
      httpStatus: error?.httpStatus ?? null,
      error: error?.message ?? null,
      startedAt,
      finishedAt: this.deps.clock.now(),
    });
  }
}
