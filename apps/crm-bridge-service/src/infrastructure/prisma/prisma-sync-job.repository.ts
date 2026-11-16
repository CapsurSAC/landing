import { Inject, Injectable } from '@nestjs/common';
import { LeadCreatedPayloadSchema, type LeadCreatedPayload } from '@capsur/api-contracts';
import { type PiiCipher } from '@capsur/nest-kit';
import { type SyncJob, type SyncJobCounts, type SyncJobSummary } from '../../domain/sync-job';
import { type SyncJobFilter, type SyncJobPatch, type SyncJobRepository, type UpsertSyncJobInput } from '../../application/ports/repositories';
import { PII_CIPHER } from '../../application/ports/tokens';
import { Prisma, SyncJobStatus } from '../../../prisma/generated/client';
import { PrismaService } from './prisma.service';

/** B12: columnas explícitas. */
const JOB_SELECT = {
  leadId: true,
  eventId: true,
  reference: true,
  payload: true,
  payloadEncrypted: true,
  status: true,
  attempts: true,
  lastError: true,
  anonymizedAt: true,
  createdAt: true,
  updatedAt: true,
} as const satisfies Prisma.SyncJobSelect;

const SUMMARY_SELECT = {
  leadId: true,
  reference: true,
  status: true,
  attempts: true,
  lastError: true,
  updatedAt: true,
} as const satisfies Prisma.SyncJobSelect;

type JobRow = Prisma.SyncJobGetPayload<{ select: typeof JOB_SELECT }>;

/**
 * Repositorio de `sync_jobs`. El payload de `lead.created.v1` se guarda cifrado con
 * `PiiCipher` en `payload_encrypted` (C8); la columna JSON heredada solo se lee mientras
 * existan filas sin migrar.
 */
@Injectable()
export class PrismaSyncJobRepository implements SyncJobRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PII_CIPHER) private readonly cipher: PiiCipher,
  ) {}

  async findByLeadId(leadId: string): Promise<SyncJob | null> {
    const row = await this.prisma.syncJob.findUnique({ where: { leadId }, select: JOB_SELECT });
    return row ? this.toDomain(row) : null;
  }

  async upsertPending(input: UpsertSyncJobInput): Promise<SyncJob> {
    const payloadEncrypted = this.cipher.encryptJson(input.payload);
    const row = await this.prisma.syncJob.upsert({
      where: { leadId: input.leadId },
      create: {
        leadId: input.leadId,
        eventId: input.eventId,
        reference: input.reference,
        payloadEncrypted,
        status: SyncJobStatus.PENDING,
        attempts: input.attempt,
      },
      update: {
        eventId: input.eventId,
        reference: input.reference,
        payloadEncrypted,
        payload: Prisma.DbNull,
        status: SyncJobStatus.PENDING,
        attempts: input.attempt,
      },
      select: JOB_SELECT,
    });
    return this.toDomain(row);
  }

  async update(leadId: string, patch: SyncJobPatch): Promise<void> {
    await this.prisma.syncJob.update({
      where: { leadId },
      data: {
        status: patch.status,
        ...(patch.attempts !== undefined ? { attempts: patch.attempts } : {}),
        ...(patch.lastError !== undefined ? { lastError: patch.lastError } : {}),
      },
      select: { leadId: true },
    });
  }

  async list(filter: SyncJobFilter): Promise<SyncJob[]> {
    const rows = await this.prisma.syncJob.findMany({
      where: filter.statuses ? { status: { in: filter.statuses } } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: filter.limit,
      select: JOB_SELECT,
    });
    return rows.map((row) => this.toDomain(row));
  }

  async listSummaries(filter: SyncJobFilter): Promise<SyncJobSummary[]> {
    const rows = await this.prisma.syncJob.findMany({
      where: filter.statuses ? { status: { in: filter.statuses } } : undefined,
      orderBy: { updatedAt: 'desc' },
      take: filter.limit,
      select: SUMMARY_SELECT,
    });
    return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
  }

  async countByStatus(): Promise<SyncJobCounts> {
    const groups = await this.prisma.syncJob.groupBy({ by: ['status'], _count: { _all: true } });
    const counts: SyncJobCounts = { pending: 0, succeeded: 0, failed: 0, dead: 0 };
    for (const group of groups) {
      const key = group.status.toLowerCase() as keyof SyncJobCounts;
      counts[key] = group._count._all;
    }
    return counts;
  }

  private toDomain(row: JobRow): SyncJob {
    return {
      leadId: row.leadId,
      eventId: row.eventId,
      reference: row.reference,
      payload: row.anonymizedAt ? null : this.readPayload(row),
      status: row.status,
      attempts: row.attempts,
      lastError: row.lastError,
      anonymizedAt: row.anonymizedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private readPayload(row: JobRow): LeadCreatedPayload | null {
    if (row.payloadEncrypted) {
      return LeadCreatedPayloadSchema.parse(this.cipher.decryptJson<unknown>(row.payloadEncrypted));
    }
    if (row.payload !== null) {
      // Fila heredada aún sin cifrar (la migra LegacyPayloadEncryption al arrancar).
      return LeadCreatedPayloadSchema.parse(row.payload);
    }
    return null;
  }
}
