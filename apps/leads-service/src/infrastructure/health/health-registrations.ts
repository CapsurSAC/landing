import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  HealthService,
  RabbitMqConnection,
  createHealthIndicator,
  rabbitMqHealthIndicator,
  type HealthExtras,
} from '@capsur/nest-kit';
import { OUTBOX_REPOSITORY, type OutboxRepository } from '../../application/ports/outbox-repository';
import { RedisConnection } from '../redis/redis.provider';

/**
 * Indicadores no críticos que dependen de proveedores globales: `rabbitmq`
 * (el outbox absorbe la caída) y `redis` (solo si está configurado; se
 * degrada a memoria/BD).
 */
@Injectable()
export class HealthRegistrations implements OnModuleInit {
  constructor(
    @Inject(HealthService) private readonly health: HealthService,
    @Inject(RabbitMqConnection) private readonly rabbit: RabbitMqConnection,
    @Inject(RedisConnection) private readonly redis: RedisConnection,
  ) {}

  onModuleInit(): void {
    this.health.register(rabbitMqHealthIndicator(this.rabbit));
    if (this.redis.client) {
      this.health.register(createHealthIndicator('redis', false, () => this.redis.ping()));
    }
  }
}

/** Campo `outbox: { pending, failed }` del health (se omite si la base está caída). */
@Injectable()
export class OutboxHealthExtras implements HealthExtras {
  constructor(@Inject(OUTBOX_REPOSITORY) private readonly outbox: OutboxRepository) {}

  async collect(context: { checks: Readonly<Record<string, 'up' | 'down'>> }): Promise<Record<string, unknown>> {
    if (context.checks.database !== 'up') {
      return { outbox: null };
    }
    try {
      return { outbox: await this.outbox.counts() };
    } catch {
      return { outbox: null };
    }
  }
}
