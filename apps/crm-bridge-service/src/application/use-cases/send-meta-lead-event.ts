import { type LeadCreatedPayload } from '@capsur/api-contracts';
import { IntegrationError } from '../../domain/integration-error';
import { buildMetaLeadEvent } from '../../domain/meta-capi';
import { type Clock } from '../ports/clock';
import { type LoggerPort, noopLogger } from '../ports/logger';
import { type MetaCapiClient } from '../ports/meta-capi-client';
import { type MetaCapiEventRepository } from '../ports/repositories';

export interface SendMetaLeadInput {
  eventId: string;
  payload: LeadCreatedPayload;
  /** 1 = primera entrega (se calcula con `x-death`). */
  attempt: number;
  maxAttempts: number;
}

export type SendMetaLeadResult =
  | { status: 'sent'; fbtraceId: string | null }
  | { status: 'skipped'; reason: 'disabled' | 'no_consent' | 'already_sent' }
  /** Fallo definitivo (4xx) o intentos agotados: el consumidor lo manda a la DLQ. */
  | { status: 'failed'; reason: string; exhausted: boolean };

export interface SendMetaLeadDependencies {
  /** null si `META_PIXEL_ID` o `META_CAPI_ACCESS_TOKEN` están vacíos. */
  client: MetaCapiClient | null;
  events: MetaCapiEventRepository;
  clock: Clock;
  testEventCode?: string | null;
  logger?: LoggerPort;
}

/**
 * A17: envía el evento `Lead` a Meta Conversions API solo si está configurada y el lead dio
 * consentimiento de marketing. Idempotente por lead (`meta_capi_events`): la cola puede
 * recibir el mismo `lead.created.v1` más de una vez (reintentos de otras colas que vuelven
 * por `capsur.events`) y Meta además deduplica por `event_id` = leadId.
 *
 * Errores: reintentable con intentos restantes → relanza (el consumidor hace nack y el
 * mensaje vuelve tras el TTL de `.retry`); definitivo o intentos agotados → `failed`.
 */
export class SendMetaLeadEvent {
  private readonly logger: LoggerPort;

  constructor(private readonly deps: SendMetaLeadDependencies) {
    this.logger = deps.logger ?? noopLogger;
  }

  async execute(input: SendMetaLeadInput): Promise<SendMetaLeadResult> {
    const { payload, eventId, attempt } = input;
    const client = this.deps.client;
    if (!client) {
      return { status: 'skipped', reason: 'disabled' };
    }
    if (!payload.consent.marketingAccepted) {
      await this.deps.events.save({
        leadId: payload.leadId,
        eventId,
        status: 'SKIPPED',
        attempts: 0,
        fbtraceId: null,
        lastError: 'no_consent',
        sentAt: null,
      });
      return { status: 'skipped', reason: 'no_consent' };
    }
    if ((await this.deps.events.findStatus(payload.leadId)) === 'SENT') {
      this.logger.info('Evento Lead ya enviado a Meta; se omite', { leadId: payload.leadId, eventId });
      return { status: 'skipped', reason: 'already_sent' };
    }

    const request = buildMetaLeadEvent(payload, { testEventCode: this.deps.testEventCode ?? undefined });
    try {
      const response = await client.sendEvents(request);
      await this.deps.events.save({
        leadId: payload.leadId,
        eventId,
        status: 'SENT',
        attempts: attempt,
        fbtraceId: response.fbtraceId,
        lastError: null,
        sentAt: this.deps.clock.now(),
      });
      this.logger.info('Evento Lead enviado a Meta Conversions API', { leadId: payload.leadId, attempt, fbtraceId: response.fbtraceId });
      return { status: 'sent', fbtraceId: response.fbtraceId };
    } catch (rawError) {
      const error = IntegrationError.classify(rawError);
      const exhausted = error.retryable && attempt >= input.maxAttempts;
      if (error.retryable && !exhausted) {
        this.logger.warn('Fallo reintentable enviando el evento Lead a Meta', { leadId: payload.leadId, attempt, error: error.message });
        throw error;
      }
      await this.deps.events.save({
        leadId: payload.leadId,
        eventId,
        status: 'FAILED',
        attempts: attempt,
        fbtraceId: null,
        lastError: error.message.slice(0, 500),
        sentAt: null,
      });
      this.logger.error('No se pudo enviar el evento Lead a Meta', {
        leadId: payload.leadId,
        attempt,
        exhausted,
        httpStatus: error.httpStatus,
        error: error.message,
      });
      return { status: 'failed', reason: error.message, exhausted };
    }
  }
}
