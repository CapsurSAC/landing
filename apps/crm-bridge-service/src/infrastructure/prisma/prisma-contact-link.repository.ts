import { Inject, Injectable } from '@nestjs/common';
import { type ContactLink, type ConversationLinkPatch, type NewContactLink } from '../../domain/contact-link';
import { type ContactLinkRepository } from '../../application/ports/repositories';
import { type Prisma } from '../../../prisma/generated/client';
import { PrismaService } from './prisma.service';

/** B12: columnas explícitas. */
const LINK_SELECT = {
  id: true,
  leadId: true,
  reference: true,
  crmAccountId: true,
  crmContactId: true,
  crmConversationId: true,
  crmInboxId: true,
  assignedTo: true,
  assignedToName: true,
  labels: true,
  syncedAt: true,
  conversationLinkedAt: true,
  autoReplySentAt: true,
  anonymizedAt: true,
} as const satisfies Prisma.CrmContactLinkSelect;

type LinkRow = Prisma.CrmContactLinkGetPayload<{ select: typeof LINK_SELECT }>;

function toDomain(row: LinkRow): ContactLink {
  return { ...row, labels: [...row.labels] };
}

@Injectable()
export class PrismaContactLinkRepository implements ContactLinkRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findByLeadId(leadId: string): Promise<ContactLink | null> {
    const row = await this.prisma.crmContactLink.findUnique({ where: { leadId }, select: LINK_SELECT });
    return row ? toDomain(row) : null;
  }

  async findByReference(reference: string): Promise<ContactLink | null> {
    const row = await this.prisma.crmContactLink.findUnique({ where: { reference }, select: LINK_SELECT });
    return row ? toDomain(row) : null;
  }

  async findByCrmContactId(crmContactId: string): Promise<ContactLink | null> {
    // Índice (crm_contact_id, synced_at DESC): sin Sort (B29).
    const row = await this.prisma.crmContactLink.findFirst({
      where: { crmContactId },
      orderBy: { syncedAt: 'desc' },
      select: LINK_SELECT,
    });
    return row ? toDomain(row) : null;
  }

  async upsert(link: NewContactLink): Promise<ContactLink> {
    const row = await this.prisma.crmContactLink.upsert({
      where: { leadId: link.leadId },
      create: {
        leadId: link.leadId,
        reference: link.reference,
        crmAccountId: link.crmAccountId,
        crmContactId: link.crmContactId,
        labels: link.labels,
        syncedAt: link.syncedAt,
      },
      update: {
        reference: link.reference,
        crmAccountId: link.crmAccountId,
        crmContactId: link.crmContactId,
        labels: link.labels,
        syncedAt: link.syncedAt,
      },
      select: LINK_SELECT,
    });
    return toDomain(row);
  }

  async markConversationLinked(leadId: string, patch: ConversationLinkPatch): Promise<ContactLink> {
    const row = await this.prisma.crmContactLink.update({
      where: { leadId },
      data: {
        crmConversationId: patch.crmConversationId,
        crmInboxId: patch.crmInboxId,
        assignedTo: patch.assignedTo,
        assignedToName: patch.assignedToName,
        conversationLinkedAt: patch.conversationLinkedAt,
      },
      select: LINK_SELECT,
    });
    return toDomain(row);
  }

  async claimAutoReply(leadId: string, at: Date): Promise<boolean> {
    // UPDATE … WHERE auto_reply_sent_at IS NULL: atómico aunque lleguen webhooks en paralelo.
    const result = await this.prisma.crmContactLink.updateMany({
      where: { leadId, autoReplySentAt: null },
      data: { autoReplySentAt: at },
    });
    return result.count === 1;
  }

  async latestSyncedAt(): Promise<Date | null> {
    const result = await this.prisma.crmContactLink.aggregate({ _max: { syncedAt: true } });
    return result._max.syncedAt;
  }
}
