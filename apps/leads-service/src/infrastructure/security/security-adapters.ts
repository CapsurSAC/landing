import { RedisRateLimiter, TurnstileVerifier } from '@capsur/nest-kit';
import type { Redis } from 'ioredis';
import type { DistributedLock } from '../../application/ports/notifications';
import type { CaptchaStatus, CaptchaVerifier, RateLimiter, RateLimitResult } from '../../application/ports/security';

/** Adaptador del puerto `CaptchaVerifier` sobre `TurnstileVerifier` del kit (C3). */
export class TurnstileCaptchaVerifier implements CaptchaVerifier {
  constructor(private readonly verifier: TurnstileVerifier) {}

  async verify(token: string | null | undefined, remoteIp: string | null): Promise<CaptchaStatus> {
    return (await this.verifier.verify(token, remoteIp)).status;
  }
}

/** Adaptador del puerto `RateLimiter` sobre `RedisRateLimiter` del kit (C2). */
export class KitRateLimiter implements RateLimiter {
  private readonly limiter: RedisRateLimiter;

  constructor(redis: Redis | null) {
    this.limiter = new RedisRateLimiter(redis);
  }

  async consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
    const decision = await this.limiter.consume(key, limit, windowMs);
    return { allowed: decision.allowed, retryAfterMs: decision.retryAfterMs };
  }
}

/**
 * Candado con `SET key token NX PX ttl` (A20). Si Redis falla, NO concede: es
 * preferible saltarse un envío a duplicarlo en todas las réplicas.
 */
export class RedisDistributedLock implements DistributedLock {
  constructor(private readonly redis: Redis) {}

  async acquire(key: string, ttlMs: number): Promise<boolean> {
    try {
      return (await this.redis.set(key, `${process.pid}:${Date.now()}`, 'PX', ttlMs, 'NX')) === 'OK';
    } catch {
      return false;
    }
  }

  async release(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

/** Candado en memoria para despliegues sin Redis (una sola instancia). */
export class MemoryDistributedLock implements DistributedLock {
  private readonly held = new Map<string, number>();

  async acquire(key: string, ttlMs: number): Promise<boolean> {
    const now = Date.now();
    const expiresAt = this.held.get(key);
    if (expiresAt !== undefined && expiresAt > now) {
      return false;
    }
    this.held.set(key, now + ttlMs);
    return true;
  }

  async release(key: string): Promise<void> {
    this.held.delete(key);
  }
}
