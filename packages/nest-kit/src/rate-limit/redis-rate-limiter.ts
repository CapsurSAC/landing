import { ResilientRedisCounter, type RedisCounterOptions, type RedisScriptClient } from './redis-counter';

/** Resultado de {@link RedisRateLimiter.consume}. */
export interface RateLimitDecision {
  /** `true` si la operación puede continuar. */
  allowed: boolean;
  /** Intentos que quedan en la ventana actual. */
  remaining: number;
  /** Milisegundos hasta poder reintentar (0 si `allowed`). */
  retryAfterMs: number;
  /** Intentos contados en la ventana (incluido este). */
  total: number;
}

/**
 * Límite por clave de negocio (p. ej. `phone:<hash>` → 5 por hora) con
 * ventana fija en Redis, compartido entre réplicas. Usa hashes, nunca datos
 * personales en claro, como clave. Si Redis falla, degrada a memoria.
 *
 * @example
 * const decision = await limiter.consume(`phone:${phoneHash}`, 5, 60 * 60 * 1000);
 * if (!decision.allowed) throw new ProblemException({ status: 429, title: 'Demasiadas solicitudes', code: 'RATE_LIMITED', headers: { 'Retry-After': String(Math.ceil(decision.retryAfterMs / 1000)) } });
 */
export class RedisRateLimiter {
  private readonly counter: ResilientRedisCounter;

  constructor(redis: RedisScriptClient | null | undefined, options: RedisCounterOptions = {}) {
    this.counter = new ResilientRedisCounter(redis, { prefix: 'limit:', context: 'RedisRateLimiter', ...options });
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitDecision> {
    const result = await this.counter.increment(key, windowMs, limit, 0);
    return {
      allowed: !result.blocked,
      remaining: Math.max(0, limit - result.totalHits),
      retryAfterMs: result.blocked ? Math.max(result.blockMs, 1) : 0,
      total: result.totalHits,
    };
  }
}
