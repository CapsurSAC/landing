/** Resultado de un incremento de contador con ventana fija (tiempos en ms). */
export interface RateCounterResult {
  /** Peticiones contadas en la ventana actual (incluida esta). */
  totalHits: number;
  /** Milisegundos hasta que caduca la ventana. */
  ttlMs: number;
  /** `true` si la petición debe rechazarse. */
  blocked: boolean;
  /** Milisegundos que quedan de bloqueo (0 si no está bloqueado). */
  blockMs: number;
}

/**
 * Algoritmo común (Redis y memoria), equivalente al almacenamiento en memoria
 * de `@nestjs/throttler` 6:
 * - `blockDurationMs > 0`: cuenta todas las peticiones; al superar `limit` se
 *   bloquea la clave durante `blockDurationMs` y la ventana se reinicia al acabar.
 * - `blockDurationMs <= 0`: con `limit` alcanzado se rechaza sin contar hasta
 *   que caduque la ventana.
 */
export interface RateCounterStore {
  increment(key: string, ttlMs: number, limit: number, blockDurationMs: number): Promise<RateCounterResult>;
}

interface MemoryEntry {
  hits: number;
  expiresAt: number;
  blockedUntil: number;
}

const SWEEP_THRESHOLD = 10_000;

/**
 * Contadores en memoria del proceso. Es el respaldo cuando Redis no
 * responde: el límite deja de ser compartido entre réplicas, pero nunca se
 * rechaza una petición por un fallo de infraestructura.
 */
export class MemoryRateCounterStore implements RateCounterStore {
  private readonly entries = new Map<string, MemoryEntry>();

  constructor(private readonly now: () => number = Date.now) {}

  async increment(key: string, ttlMs: number, limit: number, blockDurationMs: number): Promise<RateCounterResult> {
    return this.incrementSync(key, ttlMs, limit, blockDurationMs);
  }

  /** Versión síncrona (la usa el respaldo para no ceder el event loop). */
  incrementSync(key: string, ttlMs: number, limit: number, blockDurationMs: number): RateCounterResult {
    const now = this.now();
    this.sweep(now);
    let entry = this.entries.get(key);
    if (entry && entry.blockedUntil > now) {
      return { totalHits: entry.hits, ttlMs: Math.max(entry.expiresAt - now, 0), blocked: true, blockMs: entry.blockedUntil - now };
    }
    if (!entry || entry.expiresAt <= now || entry.blockedUntil > 0) {
      entry = { hits: 0, expiresAt: now + ttlMs, blockedUntil: 0 };
      this.entries.set(key, entry);
    }
    const ttlLeft = entry.expiresAt - now;
    if (blockDurationMs <= 0 && entry.hits >= limit) {
      return { totalHits: entry.hits + 1, ttlMs: ttlLeft, blocked: true, blockMs: ttlLeft };
    }
    entry.hits += 1;
    if (blockDurationMs > 0 && entry.hits > limit) {
      entry.blockedUntil = now + blockDurationMs;
      return { totalHits: entry.hits, ttlMs: ttlLeft, blocked: true, blockMs: blockDurationMs };
    }
    return { totalHits: entry.hits, ttlMs: ttlLeft, blocked: false, blockMs: 0 };
  }

  /** Número de claves vivas (para pruebas). */
  get size(): number {
    return this.entries.size;
  }

  private sweep(now: number): void {
    if (this.entries.size < SWEEP_THRESHOLD) {
      return;
    }
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now && entry.blockedUntil <= now) {
        this.entries.delete(key);
      }
    }
  }
}
