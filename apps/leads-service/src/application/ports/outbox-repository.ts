export type OutboxStatus = 'PENDING' | 'PUBLISHED' | 'FAILED';

export interface NewOutboxEvent {
  /** Id del evento (= id de la fila). */
  id: string;
  name: string;
  version: number;
  correlationId: string;
  /** Se guarda cifrado (puede llevar datos personales). */
  payload: unknown;
  createdAt: Date;
}

export interface OutboxEventRecord extends NewOutboxEvent {
  status: OutboxStatus;
  attempts: number;
  nextAttemptAt: Date;
  publishedAt: Date | null;
  lastError: string | null;
}

export interface OutboxCounts {
  pending: number;
  failed: number;
}

export interface OutboxRepository {
  /**
   * Reclama hasta `limit` eventos PENDING vencidos (`nextAttemptAt <= now`) con
   * bloqueo `FOR UPDATE SKIP LOCKED` y les adelanta `nextAttemptAt` en `leaseMs`
   * para que otra instancia no los tome mientras se publican.
   */
  claimPending(limit: number, now: Date, leaseMs: number): Promise<OutboxEventRecord[]>;
  /** Marca varios eventos como publicados en una sola sentencia. */
  markPublished(ids: readonly string[], publishedAt: Date): Promise<void>;
  scheduleRetry(id: string, attempts: number, nextAttemptAt: Date, lastError: string): Promise<void>;
  markFailed(id: string, attempts: number, lastError: string): Promise<void>;
  counts(): Promise<OutboxCounts>;
}

export const OUTBOX_REPOSITORY = Symbol('OUTBOX_REPOSITORY');
