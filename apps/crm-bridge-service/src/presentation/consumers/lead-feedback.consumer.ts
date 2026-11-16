import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { EventNames, LeadFeedbackPayloadSchema, Queues } from '@capsur/api-contracts';
import { type MessageControls, RabbitMqConnection } from '@capsur/nest-kit';
import { type ConsumeMessage } from 'amqplib';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ApplyLeadFeedback } from '../../application/use-cases/apply-lead-feedback';
import { errorMessage, parseEventMessage } from './message';

const QUEUE = Queues.CrmBridgeLeadFeedback;

/**
 * Consume `crm-bridge.lead-feedback` (A21). Sin reintentos: cualquier resultado termina en
 * ack (el caso de uso registra el fallo). Es idempotente: repetir el mensaje reescribe el
 * mismo atributo.
 */
@Injectable()
export class LeadFeedbackConsumer implements OnModuleInit {
  constructor(
    @Inject(RabbitMqConnection) private readonly connection: RabbitMqConnection,
    @Inject(ApplyLeadFeedback) private readonly applyFeedback: ApplyLeadFeedback,
    @InjectPinoLogger(LeadFeedbackConsumer.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.connection.createConsumer({
      queue: QUEUE,
      prefetch: 5,
      handler: (message, controls) => this.handle(message, controls),
    });
  }

  async handle(message: ConsumeMessage, controls: MessageControls): Promise<void> {
    const parsed = parseEventMessage(message, EventNames.LeadFeedbackReceived, LeadFeedbackPayloadSchema);
    if (!parsed.ok) {
      this.logger.error({ queue: QUEUE, reason: parsed.reason, detail: parsed.detail }, 'Mensaje inválido; se descarta');
      controls.ack();
      return;
    }
    try {
      await this.applyFeedback.execute(parsed.eventId, parsed.payload);
    } catch (error) {
      this.logger.error({ leadId: parsed.payload.leadId, error: errorMessage(error) }, 'Error guardando el feedback; se descarta (sin reintento)');
    }
    controls.ack();
  }
}
