import type { CreateLeadResponse } from '@capsur/api-contracts';

/**
 * Respuesta guardada para replays. Nunca incluye el `statusToken` (es un
 * secreto derivable: se vuelve a firmar al devolverla).
 */
export type StoredLeadResponse = Omit<CreateLeadResponse, 'statusToken'>;

export interface CachedSubmission {
  fingerprint: string;
  response: StoredLeadResponse;
}

/**
 * Caché de lectura de idempotencia. La base de datos es la fuente de verdad;
 * cualquier fallo aquí se ignora y se consulta la BD. La clave ya llega con
 * alcance de IP (`sha256(Idempotency-Key + ":" + ipHash)`, C19) y la
 * implementación guarda la respuesta cifrada (lleva el teléfono).
 */
export interface IdempotencyCache {
  get(scopedKey: string): Promise<CachedSubmission | null>;
  set(scopedKey: string, value: CachedSubmission, ttlSeconds: number): Promise<void>;
}

export const IDEMPOTENCY_CACHE = Symbol('IDEMPOTENCY_CACHE');
