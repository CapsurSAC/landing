import type { ThrottlerStorage } from '@nestjs/throttler';
import { ResilientRedisCounter, type RedisCounterOptions, type RedisScriptClient } from './redis-counter';

/** Registro que espera `ThrottlerGuard` (tiempos en segundos). */
export interface ThrottlerStorageRecordLike {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Almacenamiento de `@nestjs/throttler` 6 compartido entre réplicas (C2):
 * INCR + PEXPIRE atómicos en Redis mediante un script Lua, con soporte de
 * `blockDuration`. Si Redis falla, degrada a memoria y avisa con `warn`.
 *
 * @example
 * ThrottlerModule.forRootAsync({
 *   inject: [REDIS_CLIENT],
 *   useFactory: (redis: Redis) => ({ throttlers: [{ ttl: 60_000, limit: 10 }], storage: new RedisThrottlerStorage(redis) }),
 * })
 */
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly counter: ResilientRedisCounter;

  constructor(redis: RedisScriptClient | null | undefined, options: RedisCounterOptions = {}) {
    this.counter = new ResilientRedisCounter(redis, {
      prefix: 'throttle:',
      context: 'RedisThrottlerStorage',
      ...options,
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecordLike> {
    const result = await this.counter.increment(`${throttlerName}:${key}`, ttl, limit, blockDuration);
    return {
      totalHits: result.totalHits,
      timeToExpire: Math.ceil(result.ttlMs / 1000),
      isBlocked: result.blocked,
      timeToBlockExpire: result.blocked ? Math.max(1, Math.ceil(result.blockMs / 1000)) : 0,
    };
  }
}
