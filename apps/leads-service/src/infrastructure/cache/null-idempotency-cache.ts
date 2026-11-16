import type { CachedSubmission, IdempotencyCache } from '../../application/ports/idempotency-cache';

/** Sin Redis configurado: la base de datos resuelve toda la idempotencia. */
export class NullIdempotencyCache implements IdempotencyCache {
  async get(_key: string): Promise<CachedSubmission | null> {
    return null;
  }

  async set(_key: string, _value: CachedSubmission, _ttlSeconds: number): Promise<void> {
    // Intencionadamente vacío.
  }
}
