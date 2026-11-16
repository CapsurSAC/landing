import { type LeadAnonymizedPayload } from '@capsur/api-contracts';
import { IntegrationError } from '../../domain/integration-error';
import { type ChatwootGateway } from '../ports/chatwoot-gateway';
import { type Clock } from '../ports/clock';
import { type LoggerPort, noopLogger } from '../ports/logger';
import { type ContactLinkRepository, type ErasureResult, type PersonalDataEraser } from '../ports/repositories';

export type AnonymizeLeadResult = {
  erased: ErasureResult;
  crmContact: 'deleted' | 'not_found' | 'kept' | 'not_linked' | 'failed';
};

/**
 * C9: al recibir `lead.anonymized.v1` borra los datos personales del lead en este servicio
 * (payload cifrado de `sync_jobs`, cuerpos de webhooks, errores con posibles datos) y, si
 * `deleteCrmContact`, elimina el contacto en Chatwoot. Idempotente.
 *
 * Un fallo reintentable (BD, red, 5xx de Chatwoot) se relanza: el consumidor hace `nack`
 * con reencolado tras una pausa; la cola quorum limita las entregas (`x-delivery-limit`).
 * Un 4xx definitivo al borrar en Chatwoot se registra y no se reintenta.
 */
export class AnonymizeLead {
  private readonly logger: LoggerPort;

  constructor(
    private readonly deps: {
      gateway: ChatwootGateway;
      contactLinks: ContactLinkRepository;
      eraser: PersonalDataEraser;
      clock: Clock;
      logger?: LoggerPort;
    },
  ) {
    this.logger = deps.logger ?? noopLogger;
  }

  async execute(event: LeadAnonymizedPayload): Promise<AnonymizeLeadResult> {
    const link = await this.deps.contactLinks.findByLeadId(event.leadId);
    const erased = await this.deps.eraser.erase(
      {
        leadId: event.leadId,
        crmContactId: link?.crmContactId ?? null,
        crmConversationId: link?.crmConversationId ?? null,
      },
      this.deps.clock.now(),
    );

    let crmContact: AnonymizeLeadResult['crmContact'] = 'kept';
    if (event.deleteCrmContact) {
      if (!link) {
        crmContact = 'not_linked';
      } else {
        try {
          crmContact = await this.deps.gateway.deleteContact(link.crmContactId);
        } catch (rawError) {
          const error = IntegrationError.classify(rawError);
          if (error.retryable) {
            throw error;
          }
          crmContact = 'failed';
          this.logger.error('Chatwoot rechazó el borrado del contacto (sin reintento)', {
            leadId: event.leadId,
            httpStatus: error.httpStatus,
            error: error.message,
          });
        }
      }
    }

    this.logger.info('Lead anonimizado en crm-bridge', { leadId: event.leadId, reason: event.reason, crmContact, ...erased });
    return { erased, crmContact };
  }
}
