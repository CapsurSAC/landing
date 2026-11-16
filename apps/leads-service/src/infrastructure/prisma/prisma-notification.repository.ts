import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../prisma/generated/client';
import type { NotificationRecord, NotificationRepository } from '../../application/ports/notifications';
import { PrismaService } from './prisma.service';

interface NotificationRow {
  id: string;
  lead_id: string;
  channel: string;
  template: string;
  attempts: number;
}

@Injectable()
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async claimPending(limit: number, now: Date, leaseMs: number): Promise<NotificationRecord[]> {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<NotificationRow[]>(Prisma.sql`
        SELECT id, lead_id, channel, template, attempts
        FROM notifications
        WHERE status = 'PENDING' AND next_attempt_at <= ${now}
        ORDER BY next_attempt_at ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `);
      if (rows.length === 0) {
        return [];
      }
      await tx.notification.updateMany({
        where: { id: { in: rows.map((row) => row.id) } },
        data: { nextAttemptAt: new Date(now.getTime() + leaseMs) },
      });
      return rows.map((row) => ({
        id: row.id,
        leadId: row.lead_id,
        channel: row.channel,
        template: row.template,
        attempts: row.attempts,
      }));
    });
  }

  async markSent(id: string, sentAt: Date): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: { status: 'SENT', sentAt, lastError: null, attempts: { increment: 1 } },
      select: { id: true },
    });
  }

  async scheduleRetry(id: string, attempts: number, nextAttemptAt: Date, lastError: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: { status: 'PENDING', attempts, nextAttemptAt, lastError },
      select: { id: true },
    });
  }

  async markFailed(id: string, attempts: number, lastError: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: { status: 'FAILED', attempts, lastError },
      select: { id: true },
    });
  }

  async markSkipped(id: string, reason: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id },
      data: { status: 'SKIPPED', lastError: reason.slice(0, 1000) },
      select: { id: true },
    });
  }
}
