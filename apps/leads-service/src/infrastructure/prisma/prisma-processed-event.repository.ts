import { Inject, Injectable } from '@nestjs/common';
import type { ProcessedEventRepository } from '../../application/ports/processed-event-repository';
import { isUniqueViolation } from './prisma-errors';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaProcessedEventRepository implements ProcessedEventRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async exists(eventId: string): Promise<boolean> {
    const row = await this.prisma.processedEvent.findUnique({ where: { id: eventId }, select: { id: true } });
    return row !== null;
  }

  async record(eventId: string, name: string, processedAt: Date): Promise<void> {
    try {
      await this.prisma.processedEvent.create({ data: { id: eventId, name, processedAt } });
    } catch (error) {
      // Dos consumidores en paralelo: el segundo simplemente confirma que ya está.
      if (!isUniqueViolation(error)) {
        throw error;
      }
    }
  }
}
