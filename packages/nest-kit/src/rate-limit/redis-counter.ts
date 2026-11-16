import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Redis, type RedisOptions } from 'ioredis';
import { MemoryRateCounterStore, type RateCounterResult, type RateCounterStore } from './rate-limit-store';

/**
 * Lo mínimo que se necesita de un cliente Redis (ioredis lo cumple). Permite
 * usar un doble en pruebas unitarias.
 */
export interface RedisScriptClient {
  evalsha(sha: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
  eval(script: string, numKeys: number, ...args: Array<string | number>): Promise<unknown>;
}

/**
 * Script atómico (INCR + PEXPIRE + bloqueo) equivalente a
 * {@link MemoryRateCounterStore}. KEYS: contador, bloqueo. ARGV: ttl ms,
 * límite, duración del bloqueo ms. Devuelve {hits, ttlMs, bloqueado, bloqueoMs}.
 */
export const RATE_LIMIT_SCRIPT = `
local hitsKey = KEYS[1]
local blockKey = KEYS[2]
local ttl = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local block = tonumber(ARGV[3])
local blockTtl = redis.call('PTTL', blockKey)
if blockTtl > 0 then
  local blockedHits = tonumber(redis.call('GET', blockKey) or '0')
  return {blockedHits, blockTtl, 1, blockTtl}
end
if block <= 0 then
  local current = tonumber(redis.call('GET', hitsKey) or '0')
  if current >= limit then
    local currentTtl = redis.call('PTTL', hitsKey)
    if currentTtl < 0 then currentTtl = ttl end
    return {current + 1, currentTtl, 1, currentTtl}
  end
end
local hits = redis.call('INCR', hitsKey)
local hitsTtl = redis.call('PTTL', hitsKey)
if hitsTtl < 0 then
  redis.call('PEXPIRE', hitsKey, ttl)
  hitsTtl = ttl
end
if block > 0 and hits > limit then
  redis.call('SET', blockKey, hits, 'PX', block)
  redis.call('DEL', hitsKey)
  return {hits, hitsTtl, 1, block}
end
return {hits, hitsTtl, 0, 0}
`;

const RATE_LIMIT_SCRIPT_SHA = createHash('sha1').update(RATE_LIMIT_SCRIPT).digest('hex');

/** Opciones comunes de los limitadores respaldados por Redis. */
export interface RedisCounterOptions {
  /** Prefijo de las claves. Por defecto `rl:`. */
  prefix?: string;
  /** Tiempo máximo por operación en Redis antes de usar memoria. Por defecto 500 ms. */
  commandTimeoutMs?: number;
  /** Intervalo mínimo entre avisos de «Redis caído» en el log. Por defecto 30 s. */
  warnIntervalMs?: number;
  /** Nombre del contexto en los logs. */
  context?: string;
}

function isNoScriptError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('NOSCRIPT');
}

function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Contador con ventana fija en Redis (atómico vía Lua) que, si Redis falla
 * o tarda, degrada a memoria local y avisa con `warn`. Nunca rechaza una
 * petición por un error de Redis.
 */
export class ResilientRedisCounter implements RateCounterStore {
  private readonly memory = new MemoryRateCounterStore();
  private readonly logger: Logger;
  private readonly prefix: string;
  private readonly commandTimeoutMs: number;
  private readonly warnIntervalMs: number;
  private lastWarnAt = 0;

  constructor(
    private readonly redis: RedisScriptClient | null | undefined,
    options: RedisCounterOptions = {},
  ) {
    this.prefix = options.prefix ?? 'rl:';
    this.commandTimeoutMs = options.commandTimeoutMs ?? 500;
    this.warnIntervalMs = options.warnIntervalMs ?? 30_000;
    this.logger = new Logger(options.context ?? 'RateLimit');
    if (!redis) {
      this.logger.warn('Sin Redis configurado: el rate limiting es local a esta instancia');
    }
  }

  async increment(key: string, ttlMs: number, limit: number, blockDurationMs: number): Promise<RateCounterResult> {
    if (!this.redis) {
      return this.memory.incrementSync(key, ttlMs, limit, blockDurationMs);
    }
    // Hash tag {…}: ambas claves caen en el mismo slot si se usa Redis Cluster.
    const hitsKey = `${this.prefix}{${key}}:hits`;
    const blockKey = `${this.prefix}{${key}}:block`;
    const args: Array<string | number> = [hitsKey, blockKey, Math.max(1, Math.ceil(ttlMs)), limit, Math.max(0, Math.ceil(blockDurationMs))];
    try {
      const raw = await this.withTimeout(this.runScript(args));
      if (!Array.isArray(raw) || raw.length < 4) {
        throw new Error('Respuesta inesperada del script de rate limiting');
      }
      return {
        totalHits: toNumber(raw[0]),
        ttlMs: Math.max(0, toNumber(raw[1])),
        blocked: toNumber(raw[2]) === 1,
        blockMs: Math.max(0, toNumber(raw[3])),
      };
    } catch (error) {
      this.warnFallback(error);
      return this.memory.incrementSync(key, ttlMs, limit, blockDurationMs);
    }
  }

  private async runScript(args: Array<string | number>): Promise<unknown> {
    const redis = this.redis as RedisScriptClient;
    try {
      return await redis.evalsha(RATE_LIMIT_SCRIPT_SHA, 2, ...args);
    } catch (error) {
      if (isNoScriptError(error)) {
        return redis.eval(RATE_LIMIT_SCRIPT, 2, ...args);
      }
      throw error;
    }
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Redis no respondió en ${this.commandTimeoutMs} ms`)), this.commandTimeoutMs);
      timer.unref();
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  private warnFallback(error: unknown): void {
    const now = Date.now();
    if (now - this.lastWarnAt < this.warnIntervalMs) {
      return;
    }
    this.lastWarnAt = now;
    this.logger.warn(
      { err: error instanceof Error ? { type: error.name, message: error.message } : undefined },
      'Redis no disponible para rate limiting; se usa memoria local temporalmente',
    );
  }
}

/**
 * Cliente ioredis con valores adecuados para rate limiting e idempotencia:
 * sin cola offline (falla rápido si Redis cae), un reintento por comando y
 * reconexión con espera creciente. Los errores de conexión se loguean como
 * `warn` con frecuencia limitada en lugar de lanzar.
 */
export function createRedisClient(url: string, options: RedisOptions = {}): Redis {
  const client = new Redis(url, {
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    retryStrategy: (times: number) => Math.min(times * 500, 5000),
    ...options,
  });
  const logger = new Logger('Redis');
  let lastWarnAt = 0;
  client.on('error', (error: unknown) => {
    const now = Date.now();
    if (now - lastWarnAt >= 30_000) {
      lastWarnAt = now;
      logger.warn({ err: error instanceof Error ? { type: error.name, message: error.message } : undefined }, 'Error de conexión con Redis');
    }
  });
  return client;
}
