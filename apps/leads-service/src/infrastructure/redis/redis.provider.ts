import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { createRedisClient } from '@capsur/nest-kit';
import type { Redis } from 'ioredis';
import { ENV, type Env } from '../../config/env';

/**
 * Cliente Redis compartido (idempotencia, rate limiting, candados). `client`
 * es `null` si `REDIS_URL` no está definida: todo degrada a memoria/BD.
 */
@Injectable()
export class RedisConnection implements OnApplicationShutdown {
  private readonly logger = new Logger('RedisConnection');
  readonly client: Redis | null;

  constructor(@Inject(ENV) env: Env) {
    this.client = env.REDIS_URL ? createRedisClient(env.REDIS_URL) : null;
    if (!this.client) {
      this.logger.warn('REDIS_URL no definida: rate limiting en memoria y candados locales');
    }
  }

  async ping(): Promise<boolean> {
    return this.client !== null && (await this.client.ping()) === 'PONG';
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }
}
