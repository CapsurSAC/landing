import { EventNames, type EventEnvelope } from '@capsur/api-contracts';
import type { Clock } from '../ports/clock';
import type { EventPublisher } from '../ports/event-publisher';
import type { LeadRepository } from '../ports/lead-repository';
import type { AppLogger } from '../ports/logger';
import type { OutboxEventRecord, OutboxRepository } from '../ports/outbox-repository';
import { PRODUCER_NAME } from './create-lead';

export interface RelayOutboxOptions {
  /** Eventos por pasada. Por defecto 50. */
  batchSize?: number;
  /** Intentos antes de marcar FAILED. Por defecto 10. */
  maxAttempts?: number;
  /** Tope del backoff exponencial en segundos. Por defecto 300. */
  maxBackoffSeconds?: number;
  /** Tiempo que un evento reclamado queda reservado. Por defecto 60 s. */
  leaseMs?: number;
}

export interface RelayOutboxSummary {
  claimed: number;
  published: number;
  retried: number;
  failed: number;
  /** `true` si la pasada llenó el lote: probablemente queda trabajo pendiente. */
  saturated: boolean;
}

/**
 * Una pasada del Transactional Outbox (B10): reclama eventos pendientes, los
 * publica EN LOTE sobre el canal con confirmaciones (todas las publicaciones
 * en vuelo a la vez, cada una espera su ack) y actualiza su estado en bloque;
 * los fallos se reprograman con backoff exponencial.
 */
export class RelayOutbox {
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly maxBackoffSeconds: number;
  private readonly leaseMs: number;

  constructor(
    private readonly outbox: OutboxRepository,
    private readonly leads: LeadRepository,
    private readonly publisher: EventPublisher,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
    options: RelayOutboxOptions = {},
  ) {
    this.batchSize = options.batchSize ?? 50;
    this.maxAttempts = options.maxAttempts ?? 10;
    this.maxBackoffSeconds = options.maxBackoffSeconds ?? 300;
    this.leaseMs = options.leaseMs ?? 60_000;
  }

  async execute(): Promise<RelayOutboxSummary> {
    const summary: RelayOutboxSummary = { claimed: 0, published: 0, retried: 0, failed: 0, saturated: false };
    const events = await this.outbox.claimPending(this.batchSize, this.clock.now(), this.leaseMs);
    summary.claimed = events.length;
    summary.saturated = events.length >= this.batchSize;
    if (events.length === 0) {
      return summary;
    }

    const results = await Promise.allSettled(events.map((event) => this.publisher.publish(this.toEnvelope(event))));

    const published: OutboxEventRecord[] = [];
    for (const [index, result] of results.entries()) {
      const event = events[index];
      if (!event) {
        continue;
      }
      if (result.status === 'fulfilled') {
        published.push(event);
      } else {
        await this.handleFailure(event, result.reason, summary);
      }
    }

    if (published.length > 0) {
      const publishedAt = this.clock.now();
      await this.outbox.markPublished(
        published.map((event) => event.id),
        publishedAt,
      );
      summary.published = published.length;
      this.logger.info(
        { count: published.length, events: published.map((event) => ({ eventId: event.id, event: event.name })) },
        'Eventos publicados',
      );
      await this.markLeadsSyncing(published, publishedAt);
    }

    return summary;
  }

  private toEnvelope(event: OutboxEventRecord): EventEnvelope {
    return {
      id: event.id,
      name: event.name,
      version: event.version,
      occurredAt: event.createdAt.toISOString(),
      producer: PRODUCER_NAME,
      correlationId: event.correlationId,
      payload: event.payload,
    };
  }

  private async handleFailure(event: OutboxEventRecord, error: unknown, summary: RelayOutboxSummary): Promise<void> {
    const attempts = event.attempts + 1;
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 1000);

    if (attempts >= this.maxAttempts) {
      await this.outbox.markFailed(event.id, attempts, message);
      summary.failed += 1;
      this.logger.error(
        { eventId: event.id, event: event.name, attempts, err: error },
        'Evento de outbox marcado como FAILED tras agotar reintentos',
      );
      return;
    }

    const delaySeconds = Math.min(2 ** attempts, this.maxBackoffSeconds);
    const nextAttemptAt = new Date(this.clock.now().getTime() + delaySeconds * 1000);
    await this.outbox.scheduleRetry(event.id, attempts, nextAttemptAt, message);
    summary.retried += 1;
    this.logger.warn(
      { eventId: event.id, event: event.name, attempts, nextAttemptAt: nextAttemptAt.toISOString(), err: error },
      'Fallo al publicar; se reintentará',
    );
  }

  /** Tras publicar `lead.created.v1` los leads pasan a CRM_SYNCING (si siguen en REGISTERED). */
  private async markLeadsSyncing(events: readonly OutboxEventRecord[], now: Date): Promise<void> {
    const leadIds = events.filter((event) => event.name === EventNames.LeadCreated).map((event) => event.correlationId);
    if (leadIds.length === 0) {
      return;
    }
    try {
      await this.leads.markSyncingIfRegistered(leadIds, now);
    } catch (error) {
      // Los eventos ya están publicados; no se reintenta por esto.
      this.logger.warn({ count: leadIds.length, err: error }, 'No se pudo marcar los leads como CRM_SYNCING');
    }
  }
}

/**
 * Intervalo adaptativo del relay (B10):
 * - lote lleno → casi inmediato (25 ms) para vaciar la cola;
 * - hubo trabajo → intervalo base;
 * - vacío → se duplica hasta `base × 5`;
 * - error → intervalo base (sin acelerar contra una dependencia caída).
 */
export function nextOutboxDelay(
  previousDelayMs: number,
  summary: Pick<RelayOutboxSummary, 'claimed' | 'saturated'> | null,
  baseMs: number,
): number {
  const maxMs = baseMs * 5;
  if (summary === null) {
    return baseMs;
  }
  if (summary.saturated) {
    return 25;
  }
  if (summary.claimed > 0) {
    return baseMs;
  }
  return Math.min(Math.max(previousDelayMs, baseMs) * 2, maxMs);
}
