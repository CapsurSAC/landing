import { type AuditEntry } from '@capsur/api-contracts';
import { type AuditStore } from '@capsur/nest-kit';
import { Inject, Injectable } from '@nestjs/common';
import { type Prisma } from '../../../prisma/generated/client';
import { PrismaService } from './prisma.service';

/** Persistencia de la auditoría de acciones internas en `audit_log` (C24). */
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
        metadata: (entry.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
      },
    });
  }

  async list(limit: number): Promise<AuditEntry[]> {
    const rows = await this.prisma.auditLog.findMany({ orderBy: { at: 'desc' }, take: limit });
    return rows.map((row) => ({
      id: row.id,
      at: row.at.toISOString(),
      caller: row.caller,
      actor: row.actor,
      action: row.action,
      target: row.target,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    }));
  }
}
