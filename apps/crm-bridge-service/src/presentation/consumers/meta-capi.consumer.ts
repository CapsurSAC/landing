import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { EventNames, LeadCreatedPayloadSchema, Queues } from '@capsur/api-contracts';
import { type MessageControls, RabbitMqConnection, RabbitMqPublisher } from '@capsur/nest-kit';
import { type ConsumeMessage } from 'amqplib';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { SendMetaLeadEvent } from '../../application/use-cases/send-meta-lead-event';
import { errorMessage, forwardProperties, parseEventMessage, readAttempt } from './message';

const QUEUE = Queues.CrmBridgeMetaCapi;
const DLQ = Queues.CrmBridgeMetaCapiDlq;
const PREFETCH = 5;
/** Intentos totales (1 + 4 reintentos de 60 s) antes de la DLQ. */
export const META_CAPI_MAX_ATTEMPTS = 5;

/**
 * Consume `crm-bridge.meta-capi` (A17), enlazada a `lead.created.v1`.
 * - Desactivado o sin consentimiento → ack sin enviar.
 * - Fallo reintentable → nack(requeue=false): la cola hace dead-letter por el exchange por
 *   defecto a `crm-bridge.meta-capi.retry` (TTL 60 s), que lo devuelve a esta cola.
 * - 5 intentos (contados con `x-death`) o fallo definitivo → `publishRaw("", DLQ)` + ack.
 */
@Injectable()
export class MetaCapiConsumer implements OnModuleInit {
  constructor(
    @Inject(RabbitMqConnection) private readonly connection: RabbitMqConnection,
    @Inject(RabbitMqPublisher) private readonly publisher: RabbitMqPublisher,
    @Inject(SendMetaLeadEvent) private readonly sendLead: SendMetaLeadEvent,
    @InjectPinoLogger(MetaCapiConsumer.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.connection.createConsumer({
      queue: QUEUE,
      prefetch: PREFETCH,
      handler: (message, controls) => this.handle(message, controls),
    });
  }

  async handle(message: ConsumeMessage, controls: MessageControls): Promise<void> {
    const parsed = parseEventMessage(message, EventNames.LeadCreated, LeadCreatedPayloadSchema);
    if (!parsed.ok) {
      this.logger.error({ queue: QUEUE, reason: parsed.reason, detail: parsed.detail }, 'Mensaje inválido; se descarta');
      controls.ack();
      return;
    }
    const attempt = readAttempt(message.properties.headers, QUEUE);
    try {
      const result = await this.sendLead.execute({
        eventId: parsed.eventId,
        payload: parsed.payload,
        attempt,
        maxAttempts: META_CAPI_MAX_ATTEMPTS,
      });
      if (result.status === 'failed') {
        await this.sendToDlq(message, result.reason, attempt);
      }
      controls.ack();
    } catch (error) {
      const reason = errorMessage(error);
      if (attempt >= META_CAPI_MAX_ATTEMPTS) {
        // Error no controlado (p. ej. base de datos) con intentos agotados.
        try {
          await this.sendToDlq(message, reason, attempt);
          controls.ack();
        } catch (dlqError) {
          this.logger.error({ leadId: parsed.payload.leadId, error: errorMessage(dlqError) }, 'No se pudo enviar a la DLQ de Meta; se reintentará');
          controls.nack({ requeue: false });
        }
        return;
      }
      this.logger.warn({ leadId: parsed.payload.leadId, attempt, error: reason }, 'Evento Lead a la cola de reintento (60 s)');
      controls.nack({ requeue: false });
    }
  }

  private async sendToDlq(message: ConsumeMessage, reason: string, attempts: number): Promise<void> {
    await this.publisher.publishRaw(
      '',
      DLQ,
      message.content,
      forwardProperties(message, { 'x-crm-bridge-reason': reason.slice(0, 500), 'x-crm-bridge-attempts': attempts }),
    );
    this.logger.error({ queue: DLQ, messageId: message.properties.messageId, attempts, reason }, 'Evento Lead enviado a la DLQ de Meta');
  }
}
