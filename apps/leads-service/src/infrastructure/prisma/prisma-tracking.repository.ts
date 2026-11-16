import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../../prisma/generated/client';
import type { NewTrackingEvent, TrackingRepository } from '../../application/ports/tracking-repository';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaTrackingRepository implements TrackingRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async save(event: NewTrackingEvent): Promise<void> {
    await this.prisma.trackingEvent.create({
      data: {
        brand: event.brand,
        event: event.event,
        sessionId: event.sessionId,
        leadId: event.leadId,
        promotionId: event.promotionId,
        specialtyId: event.specialtyId,
        experimentId: event.experiment?.id ?? null,
        experimentVariant: event.experiment?.variant ?? null,
        attribution: event.attribution ? (event.attribution as Prisma.InputJsonValue) : Prisma.DbNull,
        occurredAt: event.occurredAt,
        receivedAt: event.receivedAt,
      },
      select: { id: true },
    });
  }
}
