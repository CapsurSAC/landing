import { Injectable } from '@nestjs/common';
import { type ProcessedEventRepository } from '../../application/ports/repositories';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaProcessedEventRepository implements ProcessedEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async has(eventId: string): Promise<boolean> {
    const row = await this.prisma.processedEvent.findUnique({ where: { id: eventId }, select: { id: true } });
    return row !== null;
  }

  async markProcessed(eventId: string, name: string, processedAt: Date): Promise<void> {
    await this.prisma.processedEvent.upsert({
      where: { id: eventId },
      create: { id: eventId, name, processedAt },
      update: {},
    });
  }
}
