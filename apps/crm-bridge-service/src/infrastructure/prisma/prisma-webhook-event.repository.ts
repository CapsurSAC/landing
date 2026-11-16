import { Injectable } from '@nestjs/common';
import { type NewWebhookEvent, type WebhookEventRepository, type WebhookOutcome } from '../../application/ports/repositories';
import { Prisma } from '../../../prisma/generated/client';
import { toJsonInput } from './json';
import { PrismaService } from './prisma.service';

const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class PrismaWebhookEventRepository implements WebhookEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createIfAbsent(event: NewWebhookEvent): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({
        data: {
          dedupeKey: event.dedupeKey,
          eventType: event.eventType,
          conversationId: event.conversationId,
          contactId: event.contactId,
          payload: toJsonInput(event.payload),
          signatureValid: event.signatureValid,
          receivedAt: event.receivedAt,
        },
      });
      return true;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        return false;
      }
      throw error;
    }
  }

  async finish(dedupeKey: string, outcome: WebhookOutcome, processedAt: Date): Promise<void> {
    await this.prisma.webhookEvent.update({ where: { dedupeKey }, data: { outcome, processedAt } });
  }
}
