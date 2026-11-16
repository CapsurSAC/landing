import { Injectable } from '@nestjs/common';
import { type AttemptRepository, type IntegrationAttemptRecord } from '../../application/ports/repositories';
import { PrismaService } from './prisma.service';

@Injectable()
export class PrismaAttemptRepository implements AttemptRepository {
  constructor(private readonly prisma: PrismaService) {}

  async record(attempt: IntegrationAttemptRecord): Promise<void> {
    await this.prisma.integrationAttempt.create({
      data: {
        leadId: attempt.leadId,
        eventId: attempt.eventId,
        attempt: attempt.attempt,
        operation: attempt.operation,
        status: attempt.status,
        httpStatus: attempt.httpStatus,
        error: attempt.error,
        startedAt: attempt.startedAt,
        finishedAt: attempt.finishedAt,
      },
    });
  }
}
