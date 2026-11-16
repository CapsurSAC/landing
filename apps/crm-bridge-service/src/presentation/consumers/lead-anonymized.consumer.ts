import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { EventNames, LeadAnonymizedPayloadSchema, Queues } from '@capsur/api-contracts';
import { type MessageControls, RabbitMqConnection } from '@capsur/nest-kit';
import { type ConsumeMessage } from 'amqplib';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { ANONYMIZE_RETRY_DELAY_MS } from '../../application/ports/tokens';
import { AnonymizeLead } from '../../application/use-cases/anonymize-lead';
import { errorMessage, parseEventMessage, sleep } from './message';

const QUEUE = Queues.CrmBridgeLeadAnonymized;

/**
 * Consume `crm-bridge.lead-anonymized` (C9). Sin cola de reintento: ante un fallo espera
 * `ANONYMIZE_RETRY_DELAY_MS` (5 s por defecto) y hace `nack` con reencolado; la cola quorum
 * tiene `x-delivery-limit: 10`, que corta un bucle infinito.
 */
@Injectable()
export class LeadAnonymizedConsumer implements OnModuleInit {
  constructor(
    @Inject(RabbitMqConnection) private readonly connection: RabbitMqConnection,
    @Inject(AnonymizeLead) private readonly anonymize: AnonymizeLead,
    @Inject(ANONYMIZE_RETRY_DELAY_MS) private readonly retryDelayMs: number,
    @InjectPinoLogger(LeadAnonymizedConsumer.name) private readonly logger: PinoLogger,
  ) {}

  onModuleInit(): void {
    this.connection.createConsumer({
      queue: QUEUE,
      prefetch: 2,
      handler: (message, controls) => this.handle(message, controls),
    });
  }

  async handle(message: ConsumeMessage, controls: MessageControls): Promise<void> {
    const parsed = parseEventMessage(message, EventNames.LeadAnonymized, LeadAnonymizedPayloadSchema);
    if (!parsed.ok) {
      this.logger.error({ queue: QUEUE, reason: parsed.reason, detail: parsed.detail }, 'Mensaje inválido; se descarta');
      controls.ack();
      return;
    }
    try {
      await this.anonymize.execute(parsed.payload);
      controls.ack();
    } catch (error) {
      const deliveryCount: unknown = message.properties.headers?.['x-delivery-count'];
      this.logger.warn(
        { leadId: parsed.payload.leadId, deliveryCount, retryInMs: this.retryDelayMs, error: errorMessage(error) },
        'No se pudo anonimizar; se reencolará tras una pausa',
      );
      await sleep(this.retryDelayMs);
      controls.nack({ requeue: true });
    }
  }
}
