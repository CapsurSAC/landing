import { type LeadFeedbackPayload } from '@capsur/api-contracts';
import { IntegrationError } from '../../domain/integration-error';
import { type ChatwootGateway } from '../ports/chatwoot-gateway';
import { type Clock } from '../ports/clock';
import { type LoggerPort, noopLogger } from '../ports/logger';
import { type AttemptRepository, type ContactLinkRepository } from '../ports/repositories';

export type ApplyFeedbackResult =
  | { status: 'updated'; crmContactId: string }
  | { status: 'skipped'; reason: 'contact_not_synced' | 'contact_not_found' | 'anonymized' }
  | { status: 'failed'; reason: string };

/**
 * A21: guarda «¿Cómo nos conociste?» en el atributo `how_heard` (y `how_heard_detail`) del
 * contacto en Chatwoot. Sin reintentos: es un dato secundario; si falla se registra y se
 * descarta. Nunca lanza.
 */
export class ApplyLeadFeedback {
  private readonly logger: LoggerPort;

  constructor(
    private readonly deps: {
      gateway: ChatwootGateway;
      contactLinks: ContactLinkRepository;
      attempts: AttemptRepository;
      clock: Clock;
      logger?: LoggerPort;
    },
  ) {
    this.logger = deps.logger ?? noopLogger;
  }

  async execute(eventId: string, feedback: LeadFeedbackPayload): Promise<ApplyFeedbackResult> {
    const link = await this.deps.contactLinks.findByLeadId(feedback.leadId);
    if (!link) {
      this.logger.warn('Feedback de un lead aún no sincronizado con Chatwoot; se descarta', { leadId: feedback.leadId, eventId });
      return { status: 'skipped', reason: 'contact_not_synced' };
    }
    if (link.anonymizedAt) {
      return { status: 'skipped', reason: 'anonymized' };
    }
    const startedAt = this.deps.clock.now();
    try {
      const contact = await this.deps.gateway.getContact(link.crmContactId);
      if (!contact) {
        this.logger.warn('El contacto ya no existe en Chatwoot; feedback descartado', { leadId: feedback.leadId });
        return { status: 'skipped', reason: 'contact_not_found' };
      }
      // Chatwoot reemplaza custom_attributes completo: se envía la unión.
      await this.deps.gateway.updateContactAttributes(link.crmContactId, {
        ...contact.customAttributes,
        how_heard: feedback.source,
        how_heard_detail: feedback.detail,
      });
      await this.record(feedback.leadId, eventId, startedAt, null);
      this.logger.info('Origen del lead guardado en Chatwoot', { leadId: feedback.leadId, source: feedback.source });
      return { status: 'updated', crmContactId: link.crmContactId };
    } catch (rawError) {
      const error = IntegrationError.classify(rawError);
      await this.record(feedback.leadId, eventId, startedAt, error).catch(() => undefined);
      this.logger.warn('No se pudo guardar el origen del lead en Chatwoot (sin reintento)', {
        leadId: feedback.leadId,
        httpStatus: error.httpStatus,
        error: error.message,
      });
      return { status: 'failed', reason: error.message };
    }
  }

  private async record(leadId: string, eventId: string, startedAt: Date, error: IntegrationError | null): Promise<void> {
    await this.deps.attempts.record({
      leadId,
      eventId,
      attempt: 1,
      operation: 'feedback',
      status: error ? (error.retryable ? 'RETRYABLE_FAILURE' : 'PERMANENT_FAILURE') : 'SUCCESS',
      httpStatus: error?.httpStatus ?? null,
      error: error?.message ?? null,
      startedAt,
      finishedAt: this.deps.clock.now(),
    });
  }
}
