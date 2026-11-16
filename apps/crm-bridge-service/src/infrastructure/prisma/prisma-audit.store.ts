import { Inject, Injectable } from '@nestjs/common';
import { AuditEntrySchema } from '@capsur/api-contracts';
import { type AuditEntry, type AuditStore } from '@capsur/nest-kit';
import { type Prisma } from '../../../prisma/generated/client';
import { PrismaService } from './prisma.service';
import { toJsonInput } from './json';

const AUDIT_SELECT = {
  id: true,
  at: true,
  caller: true,
  actor: true,
  action: true,
  target: true,
  metadata: true,
} as const satisfies Prisma.AuditLogSelect;

/** `audit_log` (C24). `AuditService` del kit ya redacta los metadatos antes de llegar aquí. */
@Injectable()
export class PrismaAuditStore implements AuditStore {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        id: entry.id,
        at: new Date(entry.at),
        caller: entry.caller,
        actor: entry.actor,
        action: entry.action,
        target: entry.target,
        ...(entry.metadata ? { metadata: toJsonInput(entry.metadata) } : {}),
      },
      select: { id: true },
    });
  }

  async list(limit: number): Promise<AuditEntry[]> {
    const rows = await this.prisma.auditLog.findMany({ orderBy: { at: 'desc' }, take: limit, select: AUDIT_SELECT });
    return rows.map((row) =>
      AuditEntrySchema.parse({
        ...row,
        at: row.at.toISOString(),
        metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : null,
      }),
    );
  }
}
