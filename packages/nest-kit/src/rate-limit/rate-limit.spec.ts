import { Redis } from 'ioredis';
import { isRedisAvailable, REDIS_TEST_URL } from '../testing/probe';
import { MemoryRateCounterStore } from './rate-limit-store';
import { ResilientRedisCounter, type RedisScriptClient } from './redis-counter';
import { RedisRateLimiter } from './redis-rate-limiter';
import { RedisThrottlerStorage } from './redis-throttler-storage';

/** Doble que siempre falla, como un Redis caído. */
class FailingRedis implements RedisScriptClient {
  calls = 0;
  async evalsha(): Promise<unknown> {
    this.calls += 1;
    throw new Error('Connection is closed.');
  }
  async eval(): Promise<unknown> {
    this.calls += 1;
    throw new Error('Connection is closed.');
  }
}

/** Doble que nunca responde (Redis colgado). */
class HangingRedis implements RedisScriptClient {
  evalsha(): Promise<unknown> {
    return new Promise(() => undefined);
  }
  eval(): Promise<unknown> {
    return new Promise(() => undefined);
  }
}

/** Doble que no tiene el script cargado (NOSCRIPT) y luego responde con eval. */
class NoScriptRedis implements RedisScriptClient {
  evalCalls = 0;
  async evalsha(): Promise<unknown> {
    throw new Error('NOSCRIPT No matching script. Please use EVAL.');
  }
  async eval(): Promise<unknown> {
    this.evalCalls += 1;
    return [1, 60000, 0, 0];
  }
}

describe('MemoryRateCounterStore', () => {
  it('con blockDuration bloquea al superar el límite y reinicia al acabar el bloqueo', async () => {
    let now = 1_000_000;
    const store = new MemoryRateCounterStore(() => now);
    for (let i = 1; i <= 3; i += 1) {
      expect((await store.increment('k', 60_000, 3, 10_000)).blocked).toBe(false);
    }
    const fourth = await store.increment('k', 60_000, 3, 10_000);
    expect(fourth).toMatchObject({ blocked: true, blockMs: 10_000, totalHits: 4 });
    now += 5_000;
    expect((await store.increment('k', 60_000, 3, 10_000)).blocked).toBe(true);
    now += 5_001;
    expect(await store.increment('k', 60_000, 3, 10_000)).toMatchObject({ blocked: false, totalHits: 1 });
  });

  it('sin blockDuration rechaza sin contar hasta que caduque la ventana', async () => {
    let now = 0;
    const store = new MemoryRateCounterStore(() => now);
    await store.increment('k', 1000, 2, 0);
    await store.increment('k', 1000, 2, 0);
    const third = await store.increment('k', 1000, 2, 0);
    expect(third).toMatchObject({ blocked: true, totalHits: 3, blockMs: 1000 });
    now = 1001;
    expect(await store.increment('k', 1000, 2, 0)).toMatchObject({ blocked: false, totalHits: 1 });
  });
});

describe('ResilientRedisCounter con Redis caído (fake)', () => {
  it('degrada a memoria y nunca rechaza por error de Redis', async () => {
    const redis = new FailingRedis();
    const counter = new ResilientRedisCounter(redis);
    const results = [];
    for (let i = 0; i < 3; i += 1) {
      results.push(await counter.increment('ip:1', 60_000, 5, 0));
    }
    expect(redis.calls).toBe(3);
    expect(results.map((r) => r.blocked)).toEqual([false, false, false]);
    expect(results.map((r) => r.totalHits)).toEqual([1, 2, 3]);
  });

  it('aplica el timeout por comando', async () => {
    const counter = new ResilientRedisCounter(new HangingRedis(), { commandTimeoutMs: 30 });
    const started = Date.now();
    const result = await counter.increment('k', 60_000, 5, 0);
    expect(result.blocked).toBe(false);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('recarga el script con EVAL si Redis responde NOSCRIPT', async () => {
    const redis = new NoScriptRedis();
    const counter = new ResilientRedisCounter(redis);
    expect(await counter.increment('k', 60_000, 5, 0)).toMatchObject({ totalHits: 1, blocked: false });
    expect(redis.evalCalls).toBe(1);
  });

  it('sin cliente usa memoria directamente', async () => {
    const limiter = new RedisRateLimiter(null);
    expect((await limiter.consume('phone:abc', 1, 60_000)).allowed).toBe(true);
    expect(await limiter.consume('phone:abc', 1, 60_000)).toMatchObject({ allowed: false, remaining: 0 });
  });

  it('RedisThrottlerStorage devuelve tiempos en segundos', async () => {
    const storage = new RedisThrottlerStorage(new FailingRedis());
    const record = await storage.increment('ip', 60_000, 1, 30_000, 'default');
    expect(record).toEqual({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 });
    const blocked = await storage.increment('ip', 60_000, 1, 30_000, 'default');
    expect(blocked).toMatchObject({ isBlocked: true, timeToBlockExpire: 30 });
  });
});

const describeRedis = isRedisAvailable() ? describe : describe.skip;

describeRedis('Redis real (localhost:6379)', () => {
  let redis: Redis;
  const prefix = `test:${process.pid}:${Date.now()}:`;

  beforeAll(() => {
    redis = new Redis(REDIS_TEST_URL, { maxRetriesPerRequest: 1 });
  });

  afterAll(async () => {
    const keys = await redis.keys(`${prefix}*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    redis.disconnect();
  });

  it('RedisThrottlerStorage cuenta de forma atómica entre «réplicas» y bloquea', async () => {
    const a = new RedisThrottlerStorage(redis, { prefix });
    const b = new RedisThrottlerStorage(redis, { prefix });
    const results = await Promise.all(
      Array.from({ length: 6 }, (_v, i) => (i % 2 === 0 ? a : b).increment('ip:203.0.113.7', 60_000, 5, 2_000, 'default')),
    );
    const hits = results.map((r) => r.totalHits).sort((x, y) => x - y);
    expect(hits).toEqual([1, 2, 3, 4, 5, 6]);
    expect(results.filter((r) => r.isBlocked)).toHaveLength(1);

    const whileBlocked = await a.increment('ip:203.0.113.7', 60_000, 5, 2_000, 'default');
    expect(whileBlocked.isBlocked).toBe(true);
    expect(whileBlocked.timeToBlockExpire).toBeGreaterThanOrEqual(1);
    expect(whileBlocked.timeToBlockExpire).toBeLessThanOrEqual(2);
  });

  it('el bloqueo caduca y la ventana empieza de nuevo', async () => {
    const storage = new RedisThrottlerStorage(redis, { prefix });
    await storage.increment('ip:x', 60_000, 1, 300, 'short');
    expect((await storage.increment('ip:x', 60_000, 1, 300, 'short')).isBlocked).toBe(true);
    await new Promise((done) => setTimeout(done, 400));
    expect(await storage.increment('ip:x', 60_000, 1, 300, 'short')).toMatchObject({ isBlocked: false, totalHits: 1 });
  });

  it('RedisRateLimiter.consume aplica límites por clave de negocio con TTL', async () => {
    const limiter = new RedisRateLimiter(redis, { prefix });
    const decisions = [];
    for (let i = 0; i < 6; i += 1) {
      decisions.push(await limiter.consume('phone:hash-1', 5, 60_000));
    }
    expect(decisions.map((d) => d.allowed)).toEqual([true, true, true, true, true, false]);
    expect(decisions[4]?.remaining).toBe(0);
    expect(decisions[5]?.retryAfterMs).toBeGreaterThan(59_000);
    const ttl = await redis.pttl(`${prefix}{phone:hash-1}:hits`);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60_000);
  });
});
