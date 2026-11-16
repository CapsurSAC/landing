import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { EventNames, EXCHANGE_DLX, LeadCreatedPayloadSchema, Queues } from '@capsur/api-contracts';
import { type MessageControls, RabbitMqConnection, RabbitMqPublisher } from '@capsur/nest-kit';
import { type ConsumeMessage } from 'amqplib';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { SyncLeadToChatwoot } from '../../application/use-cases/sync-lead-to-chatwoot';
import { APP_CONFIG, type Env } from '../../config/env';
import { errorMessage, forwardProperties, parseEventMessage, readAttempt } from './message';

const QUEUE = Queues.CrmBridgeLeadCreated;
const PREFETCH = 5;

/**
 * Consume `crm-bridge.lead-created` (prefetch 5) con el consumidor del kit (resuscripción y
 * apagado ordenado). Solo `checkQueue`: la topología es de infraestructura.
 * - payload inválido → log + ack;
 * - fallo reintentable → nack(requeue=false) → `crm-bridge.lead-created.retry` (TTL 30 s) → vuelve;
 * - intentos agotados → `sync_jobs` DEAD, original a `capsur.events.dlx` (DLQ), ack.
 */
@Injectable()
export class LeadCreatedConsumer implements OnModuleInit {
  constructor(
    @Inject(RabbitMqConnection) private readonly connection: RabbitMqConnection,
    @Inject(RabbitMqPublisher) private readonly publisher: RabbitMqPublisher,
    @Inject(SyncLeadToChatwoot) private readonly syncLead: SyncLeadToChatwoot,
    @Inject(APP_CONFIG) private readonly env: Env,
    @InjectPinoLogger(LeadCreatedConsumer.name) private readonly logger: PinoLogger,
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
    const { eventId, payload } = parsed;
    const attempt = readAttempt(message.properties.headers, QUEUE);
    const maxAttempts = this.env.MAX_SYNC_ATTEMPTS;

    try {
      const result = await this.syncLead.execute({ eventId, payload, attempt, maxAttempts });
      if (result.status === 'dead') {
        await this.sendToDlq(message, result.reason, attempt);
      }
      controls.ack();
    } catch (error) {
      const reason = errorMessage(error);
      if (attempt >= maxAttempts) {
        // Fallo antes de poder registrar el estado (p. ej. base de datos caída) con intentos agotados.
        try {
          await this.sendToDlq(message, reason, attempt);
          controls.ack();
        } catch (dlqError) {
          this.logger.error({ eventId, leadId: payload.leadId, error: errorMessage(dlqError) }, 'No se pudo enviar a la DLQ; se reintentará');
          controls.nack({ requeue: false });
        }
        return;
      }
      this.logger.warn({ eventId, leadId: payload.leadId, attempt, maxAttempts, error: reason }, 'Mensaje enviado a la cola de reintento');
      controls.nack({ requeue: false });
    }
  }

  private async sendToDlq(message: ConsumeMessage, reason: string, attempts: number): Promise<void> {
    await this.publisher.publishRaw(
      EXCHANGE_DLX,
      EventNames.LeadCreated,
      message.content,
      forwardProperties(message, { 'x-crm-bridge-reason': reason.slice(0, 500), 'x-crm-bridge-attempts': attempts }),
    );
    this.logger.error({ queue: QUEUE, messageId: message.properties.messageId, attempts, reason }, 'Mensaje enviado a la DLQ');
  }
}
