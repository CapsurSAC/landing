import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { EventEnvelopeSchema, Queues, type EventEnvelope } from '@capsur/api-contracts';
import { RabbitMqConnection, type MessageControls } from '@capsur/nest-kit';
import type { ConsumeMessage } from 'amqplib';
import { PinoLogger } from 'nestjs-pino';
import type { ApplyCrmStatusEvent } from '../../application/use-cases/apply-crm-status-event';
import { APPLY_CRM_STATUS_EVENT } from '../../application/use-cases/tokens';
import { InvalidEventPayloadError } from '../../domain/errors';

const PREFETCH = 10;
/** Pausa antes de devolver a la cola un mensaje que falló por infraestructura. */
export const REQUEUE_DELAY_MS = 1000;

/**
 * Consume `leads.crm-status` (ligada a `crm.#`) con el consumidor común del
 * kit (B5): se resuscribe tras reconexiones y, al apagar, cancela y espera los
 * mensajes en vuelo (B20).
 *
 * Política de confirmación:
 * - Sobre o payload inválidos → `ack` (reintentar basura no la arregla; queda en el log).
 * - Error de infraestructura (p. ej. base de datos) → `nack(requeue=true)` tras una
 *   breve pausa. La cola no tiene DLX ni cola de reintento en las definiciones del
 *   broker, así que `requeue=false` descartaría el evento para siempre.
 */
@Injectable()
export class CrmStatusConsumer implements OnModuleInit {
  constructor(
    @Inject(RabbitMqConnection) private readonly connection: RabbitMqConnection,
    @Inject(APPLY_CRM_STATUS_EVENT) private readonly applyCrmStatusEvent: ApplyCrmStatusEvent,
    @Inject(PinoLogger) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.connection.createConsumer({
      queue: Queues.LeadsCrmStatus,
      prefetch: PREFETCH,
      handler: (message, controls) => this.handle(message, controls),
    });
  }

  /** Procesa un mensaje. Público para pruebas de integración. */
  async handle(message: ConsumeMessage, controls: MessageControls): Promise<void> {
    const envelope = this.decode(message);
    if (!envelope) {
      controls.ack();
      return;
    }

    try {
      const outcome = await this.applyCrmStatusEvent.execute(envelope);
      this.logger.debug(
        { context: CrmStatusConsumer.name, eventId: envelope.id, event: envelope.name, outcome },
        'Evento CRM procesado',
      );
      controls.ack();
    } catch (error) {
      if (error instanceof InvalidEventPayloadError) {
        this.logger.error(
          { context: CrmStatusConsumer.name, eventId: envelope.id, event: envelope.name, err: error },
          'Payload inválido; se descarta el evento',
        );
        controls.ack();
        return;
      }
      this.logger.error(
        { context: CrmStatusConsumer.name, eventId: envelope.id, event: envelope.name, err: error },
        'Error al aplicar el evento; se devuelve a la cola',
      );
      await new Promise((resolve) => setTimeout(resolve, REQUEUE_DELAY_MS));
      controls.nack({ requeue: true });
    }
  }

  private decode(message: ConsumeMessage): EventEnvelope | null {
    let raw: unknown;
    try {
      raw = JSON.parse(message.content.toString('utf8'));
    } catch (error) {
      this.logger.error(
        { context: CrmStatusConsumer.name, err: error, messageId: message.properties.messageId },
        'Mensaje no es JSON; se descarta',
      );
      return null;
    }
    const parsed = EventEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      this.logger.error(
        { context: CrmStatusConsumer.name, messageId: message.properties.messageId, issues: parsed.error.issues },
        'Sobre de evento inválido; se descarta',
      );
      return null;
    }
    return parsed.data;
  }
}
