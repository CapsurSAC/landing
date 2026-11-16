import { Inject, Injectable } from '@nestjs/common';
import { type MetaCapiEventRepository, type MetaCapiRecord, type MetaCapiStatus } from '../../application/ports/repositories';
import { PrismaService } from './prisma.service';

/** `meta_capi_events` (A17): idempotencia por lead y resultado del envío. */
@Injectable()
export class PrismaMetaCapiEventRepository implements MetaCapiEventRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findStatus(leadId: string): Promise<MetaCapiStatus | null> {
    const row = await this.prisma.metaCapiEvent.findUnique({ where: { leadId }, select: { status: true } });
    return row?.status ?? null;
  }

  async save(record: MetaCapiRecord): Promise<void> {
    const data = {
      eventId: record.eventId,
      status: record.status,
      attempts: record.attempts,
      fbtraceId: record.fbtraceId,
      lastError: record.lastError,
      sentAt: record.sentAt,
    };
    await this.prisma.metaCapiEvent.upsert({
      where: { leadId: record.leadId },
      create: { leadId: record.leadId, ...data },
      update: data,
      select: { leadId: true },
    });
  }
}
