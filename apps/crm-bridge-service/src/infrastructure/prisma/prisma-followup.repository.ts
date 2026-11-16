import { Inject, Injectable } from '@nestjs/common';
import {
  type FollowupRepository,
  type FollowupResult,
  type FollowupTask,
} from '../../application/ports/repositories';
import { FollowupStatus } from '../../../prisma/generated/client';
import { PrismaService } from './prisma.service';

interface ClaimedRow {
  lead_id: string;
  attempts: number;
}

/** `whatsapp_followups` (A6). */
@Injectable()
export class PrismaFollowupRepository implements FollowupRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async schedule(leadId: string, dueAt: Date): Promise<void> {
    // Una sola fila por lead: si ya existe (enviado, omitido o pendiente) no se toca.
    await this.prisma.whatsappFollowup.createMany({ data: [{ leadId, dueAt }], skipDuplicates: true });
  }

  async claimDue(now: Date, limit: number, leaseMs: number): Promise<FollowupTask[]> {
    const nowIso = now.toISOString();
    const lockedUntil = new Date(now.getTime() + leaseMs);
    return this.prisma.$transaction(async (tx) => {
      // Candado entre réplicas: cada una se lleva filas distintas y no espera a las demás.
      const rows = await tx.$queryRaw<ClaimedRow[]>`
        SELECT lead_id, attempts
          FROM whatsapp_followups
         WHERE (status = 'PENDING' AND due_at <= ${nowIso}::timestamp(3))
            OR (status = 'PROCESSING' AND locked_until < ${nowIso}::timestamp(3))
         ORDER BY due_at
         LIMIT ${limit}
           FOR UPDATE SKIP LOCKED`;
      if (rows.length === 0) {
        return [];
      }
      await tx.whatsappFollowup.updateMany({
        where: { leadId: { in: rows.map((row) => row.lead_id) } },
        data: { status: FollowupStatus.PROCESSING, lockedUntil },
      });
      return rows.map((row) => ({ leadId: row.lead_id, attempts: row.attempts }));
    });
  }

  async complete(leadId: string, result: FollowupResult): Promise<void> {
    await this.prisma.whatsappFollowup.update({
      where: { leadId },
      data: {
        status: result.status,
        attempts: result.attempts,
        lockedUntil: null,
        lastError: result.reason ? result.reason.slice(0, 500) : null,
        ...(result.crmConversationId !== undefined ? { crmConversationId: result.crmConversationId } : {}),
        ...(result.templateName !== undefined ? { templateName: result.templateName } : {}),
        ...(result.dueAt ? { dueAt: result.dueAt } : {}),
        ...(result.sentAt !== undefined ? { sentAt: result.sentAt } : {}),
      },
      select: { leadId: true },
    });
  }

  async isFollowupConversation(conversationId: string): Promise<boolean> {
    const row = await this.prisma.whatsappFollowup.findFirst({ where: { crmConversationId: conversationId }, select: { leadId: true } });
    return row !== null;
  }
}
