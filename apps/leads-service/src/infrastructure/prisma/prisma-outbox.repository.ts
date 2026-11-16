import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../prisma/generated/client';
import type {
  OutboxCounts,
  OutboxEventRecord,
  OutboxRepository,
  OutboxStatus,
} from '../../application/ports/outbox-repository';
import { PII_CODEC, PiiCodec } from '../pii/pii-codec';
import { PrismaService } from './prisma.service';

/** Fila cruda devuelta por `$queryRaw` (nombres de columna de la tabla). */
interface OutboxRow {
  id: string;
  name: string;
  version: number;
  correlation_id: string;
  payload: string;
  status: OutboxStatus;
  attempts: number;
  next_attempt_at: Date;
  published_at: Date | null;
  last_error: string | null;
  created_at: Date;
}

@Injectable()
export class PrismaOutboxRepository implements OutboxRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PII_CODEC) private readonly codec: PiiCodec,
  ) {}

  async claimPending(limit: number, now: Date, leaseMs: number): Promise<OutboxEventRecord[]> {
    return this.prisma.$transaction(async (tx) => {
      // SKIP LOCKED permite varias instancias del relay sin pisarse. Usa el
      // índice (status, next_attempt_at).
      const rows = await tx.$queryRaw<OutboxRow[]>(Prisma.sql`
        SELECT id, name, version, correlation_id, payload, status, attempts,
               next_attempt_at, published_at, last_error, created_at
        FROM outbox_events
        WHERE status = 'PENDING' AND next_attempt_at <= ${now}
        ORDER BY next_attempt_at ASC, created_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `);
      if (rows.length === 0) {
        return [];
      }
      await tx.outboxEvent.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: { nextAttemptAt: new Date(now.getTime() + leaseMs) },
      });
      return rows.map((row) => this.toRecord(row));
    });
  }

  async markPublished(ids: readonly string[], publishedAt: Date): Promise<void> {
    if (ids.length === 0) {
      return;
    }
    await this.prisma.outboxEvent.updateMany({
      where: { id: { in: [...ids] } },
      data: { status: 'PUBLISHED', publishedAt, lastError: null },
    });
  }

  async scheduleRetry(id: string, attempts: number, nextAttemptAt: Date, lastError: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { status: 'PENDING', attempts, nextAttemptAt, lastError },
      select: { id: true },
    });
  }

  async markFailed(id: string, attempts: number, lastError: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id },
      data: { status: 'FAILED', attempts, lastError },
      select: { id: true },
    });
  }

  async counts(): Promise<OutboxCounts> {
    const rows = await this.prisma.outboxEvent.groupBy({
      by: ['status'],
      where: { status: { in: ['PENDING', 'FAILED'] } },
      _count: { _all: true },
    });
    const count = (status: OutboxStatus): number => rows.find((row) => row.status === status)?._count._all ?? 0;
    return { pending: count('PENDING'), failed: count('FAILED') };
  }

  private toRecord(row: OutboxRow): OutboxEventRecord {
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      correlationId: row.correlation_id,
      payload: this.codec.openJson(row.payload),
      status: row.status,
      attempts: row.attempts,
      nextAttemptAt: row.next_attempt_at,
      publishedAt: row.published_at,
      lastError: row.last_error,
      createdAt: row.created_at,
    };
  }
}
