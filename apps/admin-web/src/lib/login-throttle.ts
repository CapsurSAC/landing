/**
 * Bloqueo de inicio de sesión por intentos fallidos.
 *
 * LIMITACIÓN: el estado vive en la memoria de ESTE proceso. Se pierde al
 * reiniciar y no se comparte entre réplicas; con más de una réplica el límite
 * efectivo se multiplica por el número de instancias. Para escalar hay que
 * moverlo a Redis (como el rate limiting de leads-service).
 */

export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;
/** Límite adicional por IP (independiente del correo) contra el barrido de cuentas. */
export const MAX_FAILURES_PER_IP = 20;

interface Bucket {
  failures: number[];
}

export class LoginThrottle {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxFailures: number = MAX_FAILURES,
    private readonly windowMs: number = WINDOW_MS,
    private readonly maxKeys: number = 10_000,
  ) {}

  private recent(key: string, now: number): number[] {
    const bucket = this.buckets.get(key);
    if (!bucket) return [];
    bucket.failures = bucket.failures.filter((t) => now - t < this.windowMs);
    if (bucket.failures.length === 0) this.buckets.delete(key);
    return bucket.failures;
  }

  /** Milisegundos que faltan para poder reintentar; 0 si no está bloqueado. */
  retryAfterMs(key: string, now: number = Date.now()): number {
    const failures = this.recent(key, now);
    if (failures.length < this.maxFailures) return 0;
    const oldestRelevant = failures[failures.length - this.maxFailures]!;
    return Math.max(0, oldestRelevant + this.windowMs - now);
  }

  isBlocked(key: string, now: number = Date.now()): boolean {
    return this.retryAfterMs(key, now) > 0;
  }

  registerFailure(key: string, now: number = Date.now()): void {
    if (!this.buckets.has(key) && this.buckets.size >= this.maxKeys) this.evictExpired(now);
    const bucket = this.buckets.get(key) ?? { failures: [] };
    bucket.failures.push(now);
    this.buckets.set(key, bucket);
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  private evictExpired(now: number): void {
    for (const key of [...this.buckets.keys()]) this.recent(key, now);
    // Si sigue lleno (ataque con muchas claves), descarta las más antiguas.
    while (this.buckets.size >= this.maxKeys) {
      const first = this.buckets.keys().next().value;
      if (first === undefined) break;
      this.buckets.delete(first);
    }
  }
}

export function throttleKeys(email: string, ip: string): { pair: string; ip: string } {
  return { pair: `pair:${email.trim().toLowerCase()}|${ip}`, ip: `ip:${ip}` };
}
