import { Inject, Injectable } from '@nestjs/common';
import { type HealthIndicator, RabbitMqConnection } from '@capsur/nest-kit';
import { type ChatwootGateway } from '../../application/ports/chatwoot-gateway';
import { type QueueInspector } from '../../application/ports/queue-inspector';
import { CHATWOOT_GATEWAY } from '../../application/ports/tokens';

/** Tiempo máximo del chequeo de Chatwoot (el kit corta cada chequeo a 1,5 s). */
const CHATWOOT_CHECK_TIMEOUT_MS = 1400;

/** `rabbitmq` (no crítico: los mensajes esperan en el broker y los reintentos absorben la caída). */
@Injectable()
export class RabbitHealthIndicator implements HealthIndicator {
  readonly name = 'rabbitmq';
  readonly critical = false;

  constructor(@Inject(RabbitMqConnection) private readonly connection: RabbitMqConnection) {}

  async check(): Promise<boolean> {
    return this.connection.isConnected();
  }
}

/** `chatwoot` (no crítico: sin Chatwoot los leads se reintentan y terminan en DLQ reprocesable). */
@Injectable()
export class ChatwootHealthIndicator implements HealthIndicator {
  readonly name = 'chatwoot';
  readonly critical = false;

  constructor(@Inject(CHATWOOT_GATEWAY) private readonly gateway: ChatwootGateway) {}

  async check(): Promise<boolean> {
    return this.gateway.checkAccount(CHATWOOT_CHECK_TIMEOUT_MS);
  }
}

/** Profundidad de colas con `checkQueue` (no requiere permisos de gestión). */
@Injectable()
export class RabbitQueueInspector implements QueueInspector {
  constructor(@Inject(RabbitMqConnection) private readonly connection: RabbitMqConnection) {}

  async stats(queue: string): Promise<{ messageCount: number; consumerCount: number }> {
    const stats = await this.connection.queueStats(queue);
    return { messageCount: stats.messageCount, consumerCount: stats.consumerCount };
  }
}
