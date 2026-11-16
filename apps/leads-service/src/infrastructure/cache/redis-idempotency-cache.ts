import { z } from 'zod';
import type { Redis } from 'ioredis';
import type { CachedSubmission, IdempotencyCache } from '../../application/ports/idempotency-cache';
import type { PiiCodec } from '../pii/pii-codec';
import { parseStoredResponse } from '../prisma/prisma-submission.repository';

const CachedEntrySchema = z.object({
  fingerprint: z.string().length(64),
  /** Respuesta cifrada con PiiCipher: Redis nunca guarda datos personales en claro (C22). */
  response: z.string().min(1),
});

const KEY_PREFIX = 'leads:idempotency:';

/**
 * Caché de idempotencia en Redis sobre el cliente compartido (sin cola
 * offline: falla rápido para que el caso de uso recurra a la BD). La clave ya
 * es un hash con alcance de IP y el valor va cifrado.
 */
export class RedisIdempotencyCache implements IdempotencyCache {
  constructor(
    private readonly redis: Redis,
    private readonly codec: PiiCodec,
  ) {}

  async get(scopedKey: string): Promise<CachedSubmission | null> {
    const raw = await this.redis.get(KEY_PREFIX + scopedKey);
    if (!raw) {
      return null;
    }
    const entry = CachedEntrySchema.safeParse(JSON.parse(raw));
    if (!entry.success) {
      return null;
    }
    const response = parseStoredResponse(this.codec, entry.data.response);
    return response ? { fingerprint: entry.data.fingerprint, response } : null;
  }

  async set(scopedKey: string, value: CachedSubmission, ttlSeconds: number): Promise<void> {
    const entry = { fingerprint: value.fingerprint, response: this.codec.sealJson(value.response) };
    await this.redis.set(KEY_PREFIX + scopedKey, JSON.stringify(entry), 'EX', ttlSeconds);
  }
}
