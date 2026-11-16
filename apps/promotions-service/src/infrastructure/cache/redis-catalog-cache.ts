import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { type HealthIndicator } from '@capsur/nest-kit';
import { type CatalogCache } from '../../application/ports';

/** Intervalo mínimo entre avisos de error de conexión para no inundar el log. */
const ERROR_LOG_INTERVAL_MS = 30_000;

/**
 * Caché de catálogo sobre Redis. Conecta de forma perezosa y degrada a
 * "sin caché" ante cualquier fallo: ningún error de Redis llega al cliente.
 */
export class RedisCatalogCache implements CatalogCache, HealthIndicator {
  readonly name = 'redis';
  readonly critical = false;

  private readonly logger = new Logger(RedisCatalogCache.name);
  private readonly client: Redis;
  private readonly keyPrefix: string;
  private lastErrorLoggedAt = 0;

  constructor(redisUrl: string, keyPrefix = 'promotions-service:') {
    this.keyPrefix = keyPrefix;
    this.client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      commandTimeout: 1_000,
      enableOfflineQueue: false,
      keyPrefix,
      retryStrategy: (attempt) => Math.min(attempt * 500, 5_000),
    });
    // Sin este manejador ioredis emitiría un error no capturado al perder la conexión.
    this.client.on('error', (error: Error) => this.warnThrottled(`Error de conexión: ${error.message}`));
    this.client.on('ready', () => this.logger.log('Conexión a Redis lista'));
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.client.get(key);
      return raw === null ? null : (JSON.parse(raw) as T);
    } catch (error) {
      this.warnThrottled(`GET ${key} falló, se sirve sin caché: ${describe(error)}`);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', Math.max(1, Math.floor(ttlSeconds)));
    } catch (error) {
      this.warnThrottled(`SET ${key} falló, se omite la caché: ${describe(error)}`);
    }
  }

  /**
   * Borra las claves que empiezan por `prefix` con SCAN (no bloquea Redis
   * como KEYS). ioredis no aplica `keyPrefix` a los patrones de SCAN ni a
   * las claves devueltas, así que se añade y se quita a mano.
   */
  async invalidatePrefix(prefix: string): Promise<void> {
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.client.scan(cursor, 'MATCH', `${this.keyPrefix}${prefix}*`, 'COUNT', 200);
        cursor = next;
        const unprefixed = keys.map((key) => key.slice(this.keyPrefix.length));
        if (unprefixed.length > 0) {
          await this.client.del(...unprefixed);
        }
      } while (cursor !== '0');
    } catch (error) {
      this.warnThrottled(`Invalidación de "${prefix}" falló; expirará por TTL: ${describe(error)}`);
    }
  }

  /** Indicador de salud no crítico (B19): sin Redis el catálogo se sirve sin caché. */
  async check(): Promise<boolean> {
    const reply = await this.client.ping();
    return reply === 'PONG';
  }

  /**
   * Inicia la conexión al arrancar para que el primer chequeo de salud no dé
   * un falso «down». No bloquea ni lanza: si Redis no está, se sirve sin caché.
   */
  warmUp(): void {
    if (this.client.status === 'wait') {
      this.client.connect().catch((error: unknown) => this.warnThrottled(`Redis no disponible al arrancar: ${describe(error)}`));
    }
  }

  /** Cierra la conexión de forma ordenada; se invoca desde los shutdown hooks. */
  async close(): Promise<void> {
    try {
      await this.client.quit();
    } catch {
      this.client.disconnect();
    }
  }

  private warnThrottled(message: string): void {
    const now = Date.now();
    if (now - this.lastErrorLoggedAt >= ERROR_LOG_INTERVAL_MS) {
      this.lastErrorLoggedAt = now;
      this.logger.warn(message);
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
