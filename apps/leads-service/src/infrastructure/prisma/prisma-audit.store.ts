import { Inject, Injectable } from '@nestjs/common';
import type { AuditEntry, AuditStore } from '@capsur/nest-kit';
import { Prisma } from '../../../prisma/generated/client';
import { PrismaService } from './prisma.service';

/** Persistencia de auditoría (C24) en `audit_log`. El kit ya redacta `metadata`. */
@Injectable()
export class PrismaAuditStore implements AuditStore {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        id: entry.id,
        at: new Date(entry.at),
        caller: entry.caller.slice(0, 64),
        actor: entry.actor ? entry.actor.slice(0, 254) : null,
        action: entry.action.slice(0, 64),
        target: entry.target ? entry.target.slice(0, 128) : null,
        metadata: entry.metadata ? (entry.metadata as Prisma.InputJsonObject) : Prisma.DbNull,
      },
      select: { id: true },
    });
  }

  async list(limit: number): Promise<AuditEntry[]> {
    const rows = await this.prisma.auditLog.findMany({
      orderBy: { at: 'desc' },
      take: limit,
      select: { id: true, at: true, caller: true, actor: true, action: true, target: true, metadata: true },
    });
    return rows.map((row) => ({
      id: row.id,
      at: row.at.toISOString(),
      caller: row.caller,
      actor: row.actor,
      action: row.action,
      target: row.target,
      metadata:
        row.metadata !== null && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : null,
    }));
  }
}
