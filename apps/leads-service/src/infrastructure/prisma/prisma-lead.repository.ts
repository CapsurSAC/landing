import { Inject, Injectable } from '@nestjs/common';
import { EventNames, type Attribution } from '@capsur/api-contracts';
import { z } from 'zod';
import type { Prisma } from '../../../prisma/generated/client';
import type {
  AdminLeadRecord,
  CreateLeadAggregate,
  LeadListFilter,
  LeadRepository,
  ProcessedEventMark,
} from '../../application/ports/lead-repository';
import type { NewOutboxEvent } from '../../application/ports/outbox-repository';
import { ReferenceCollisionError } from '../../domain/errors';
import { ANONYMIZED_NAME, Lead, type LeadProps, type LeadSpecialty } from '../../domain/lead';
import { PII_CODEC, PiiCodec } from '../pii/pii-codec';
import { isUniqueViolation } from './prisma-errors';
import { PrismaService } from './prisma.service';

/** Columnas que se leen siempre (B12: nunca `select *`). */
export const LEAD_SELECT = {
  id: true,
  reference: true,
  brand: true,
  promotionId: true,
  promotionName: true,
  promotionHeadline: true,
  priceAmount: true,
  campaignId: true,
  campus: true,
  specialties: true,
  fullName: true,
  phoneE164: true,
  phoneHash: true,
  phoneCountry: true,
  email: true,
  emailHash: true,
  experimentId: true,
  experimentVariant: true,
  status: true,
  crmContactId: true,
  crmConversationId: true,
  crmAdvisorName: true,
  crmSyncedAt: true,
  crmConversationLinkedAt: true,
  feedbackSource: true,
  feedbackDetail: true,
  feedbackAt: true,
  anonymizedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.LeadSelect;

const ADMIN_LEAD_SELECT = {
  ...LEAD_SELECT,
  attribution: {
    select: {
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      utmContent: true,
      utmTerm: true,
      referrer: true,
      landingPath: true,
      fbclid: true,
      gclid: true,
    },
  },
  consents: {
    select: { marketingAccepted: true, privacyVersion: true },
    orderBy: { acceptedAt: 'desc' },
    take: 1,
  },
} satisfies Prisma.LeadSelect;

type LeadRow = Prisma.LeadGetPayload<{ select: typeof LEAD_SELECT }>;
type AdminLeadRow = Prisma.LeadGetPayload<{ select: typeof ADMIN_LEAD_SELECT }>;

const SpecialtiesSchema = z.array(z.object({ id: z.string(), name: z.string() }));

function parseSpecialties(value: Prisma.JsonValue): LeadSpecialty[] {
  const parsed = SpecialtiesSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

function compactAttribution(row: AdminLeadRow['attribution']): Attribution | null {
  if (!row) {
    return null;
  }
  const entries = Object.entries(row).filter(([, value]) => value !== null && value !== '');
  return entries.length > 0 ? (Object.fromEntries(entries) as Attribution) : {};
}

@Injectable()
export class PrismaLeadRepository implements LeadRepository {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PII_CODEC) private readonly codec: PiiCodec,
  ) {}

  async findById(id: string): Promise<Lead | null> {
    const row = await this.prisma.lead.findUnique({ where: { id }, select: LEAD_SELECT });
    return row ? Lead.fromProps(this.toProps(row)) : null;
  }

  async findRecentDuplicate(input: { brand: string; phoneHash: string; promotionId: string; since: Date }): Promise<Lead | null> {
    const row = await this.prisma.lead.findFirst({
      where: {
        brand: input.brand,
        phoneHash: input.phoneHash,
        promotionId: input.promotionId,
        createdAt: { gte: input.since },
      },
      orderBy: { createdAt: 'desc' },
      select: LEAD_SELECT,
    });
    return row ? Lead.fromProps(this.toProps(row)) : null;
  }

  async createWithOutbox(aggregate: CreateLeadAggregate): Promise<void> {
    const { lead, consent, attribution, submission, outboxEvent, notification } = aggregate;
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.lead.create({
          data: {
            id: lead.id,
            reference: lead.reference,
            brand: lead.brand,
            promotionId: lead.promotionId,
            promotionName: lead.promotionName,
            promotionHeadline: lead.promotionHeadline,
            priceAmount: lead.priceAmount,
            campaignId: lead.campaignId,
            campus: lead.campus,
            specialties: lead.specialties.map((s) => ({ id: s.id, name: s.name })),
            fullName: this.codec.seal(lead.fullName),
            phoneE164: this.codec.seal(lead.phoneE164),
            phoneHash: lead.phoneHash,
            phoneCountry: lead.phoneCountry,
            email: this.codec.seal(lead.email),
            emailHash: lead.emailHash,
            experimentId: lead.experiment?.id ?? null,
            experimentVariant: lead.experiment?.variant ?? null,
            status: lead.status,
            createdAt: lead.createdAt,
            updatedAt: lead.updatedAt,
            consents: {
              create: {
                contactAccepted: consent.contactAccepted,
                marketingAccepted: consent.marketingAccepted,
                privacyVersion: consent.privacyVersion,
                acceptedAt: consent.acceptedAt,
                ipHash: consent.ipHash,
                userAgent: consent.userAgent,
              },
            },
            attribution: attribution
              ? {
                  create: {
                    utmSource: attribution.utmSource ?? null,
                    utmMedium: attribution.utmMedium ?? null,
                    utmCampaign: attribution.utmCampaign ?? null,
                    utmContent: attribution.utmContent ?? null,
                    utmTerm: attribution.utmTerm ?? null,
                    referrer: attribution.referrer ?? null,
                    landingPath: attribution.landingPath ?? null,
                    fbclid: attribution.fbclid ?? null,
                    gclid: attribution.gclid ?? null,
                  },
                }
              : undefined,
            submissions: {
              create: {
                idempotencyKey: submission.idempotencyKey,
                requestFingerprint: submission.requestFingerprint,
                ipHash: submission.ipHash,
                userAgent: submission.userAgent,
                outcome: submission.outcome,
                responseSnapshot: this.codec.sealJson(submission.responseSnapshot),
              },
            },
            notifications: notification
              ? {
                  create: {
                    id: notification.id,
                    channel: notification.channel,
                    template: notification.template,
                    nextAttemptAt: notification.createdAt,
                    createdAt: notification.createdAt,
                  },
                }
              : undefined,
          },
          select: { id: true },
        });
        await tx.outboxEvent.create({ data: this.outboxData(outboxEvent), select: { id: true } });
      });
    } catch (error) {
      if (isUniqueViolation(error, ['reference'])) {
        throw new ReferenceCollisionError(lead.reference);
      }
      throw error;
    }
  }

  async save(lead: Lead): Promise<void> {
    const props = lead.toProps();
    await this.prisma.lead.update({ where: { id: props.id }, data: this.stateData(props), select: { id: true } });
  }

  async saveWithProcessedEvent(lead: Lead, event: ProcessedEventMark): Promise<void> {
    const props = lead.toProps();
    await this.prisma.$transaction([
      this.prisma.lead.update({ where: { id: props.id }, data: this.stateData(props), select: { id: true } }),
      this.prisma.processedEvent.create({
        data: { id: event.id, name: event.name, processedAt: event.processedAt },
        select: { id: true },
      }),
    ]);
  }

  async markSyncingIfRegistered(leadIds: readonly string[], now: Date): Promise<number> {
    if (leadIds.length === 0) {
      return 0;
    }
    const result = await this.prisma.lead.updateMany({
      where: { id: { in: [...leadIds] }, status: 'REGISTERED' },
      data: { status: 'CRM_SYNCING', updatedAt: now },
    });
    return result.count;
  }

  async saveFeedback(lead: Lead, outboxEvent: NewOutboxEvent): Promise<boolean> {
    const props = lead.toProps();
    if (!props.feedback) {
      return false;
    }
    const feedback = props.feedback;
    return this.prisma.$transaction(async (tx) => {
      // Condicional: si otra petición respondió antes, no se pisa ni se publica dos veces.
      const updated = await tx.lead.updateMany({
        where: { id: props.id, feedbackAt: null },
        data: {
          feedbackSource: feedback.source,
          feedbackDetail: feedback.detail,
          feedbackAt: feedback.receivedAt,
          updatedAt: props.updatedAt,
        },
      });
      if (updated.count === 0) {
        return false;
      }
      await tx.outboxEvent.create({ data: this.outboxData(outboxEvent), select: { id: true } });
      return true;
    });
  }

  async saveAnonymized(lead: Lead, outboxEvent: NewOutboxEvent): Promise<void> {
    const props = lead.toProps();
    const anonymizedAt = props.anonymizedAt ?? props.updatedAt;
    await this.prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: props.id },
        data: {
          fullName: this.codec.seal(ANONYMIZED_NAME),
          phoneE164: this.codec.seal(''),
          email: this.codec.seal(''),
          phoneHash: null,
          emailHash: null,
          feedbackDetail: null,
          anonymizedAt,
          updatedAt: props.updatedAt,
        },
        select: { id: true },
      });
      await tx.leadAttribution.deleteMany({ where: { leadId: props.id } });
      // Permitido por el trigger append-only: solo se ponen a NULL ip_hash/user_agent.
      await tx.consentRecord.updateMany({ where: { leadId: props.id }, data: { ipHash: null, userAgent: null } });
      await tx.leadSubmission.updateMany({
        where: { leadId: props.id },
        data: { ipHash: null, userAgent: null, responseSnapshot: this.codec.sealJson(null) },
      });
      // Un lead.created aún sin publicar no debe llegar al CRM con los datos originales.
      await tx.outboxEvent.updateMany({
        where: { correlationId: props.id, name: EventNames.LeadCreated, status: 'PENDING' },
        data: { status: 'FAILED', lastError: 'Lead anonimizado antes de publicar' },
      });
      // Los payloads ya publicados (o descartados) del lead dejan de guardar sus datos.
      await tx.outboxEvent.updateMany({
        where: { correlationId: props.id, status: { in: ['PUBLISHED', 'FAILED'] } },
        data: { payload: this.codec.sealJson({ anonymized: true }) },
      });
      await tx.notification.updateMany({
        where: { leadId: props.id, status: 'PENDING' },
        data: { status: 'SKIPPED', lastError: 'Lead anonimizado' },
      });
      await tx.outboxEvent.create({ data: this.outboxData(outboxEvent), select: { id: true } });
    });
  }

  async findIdsCreatedBefore(createdBefore: Date, limit: number): Promise<string[]> {
    const rows = await this.prisma.lead.findMany({
      where: { createdAt: { lt: createdBefore }, anonymizedAt: null },
      orderBy: { createdAt: 'asc' },
      take: limit,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async findIdsByContact(input: {
    emailHash?: string | null;
    phoneHash?: string | null;
    reference?: string | null;
  }): Promise<string[]> {
    const or: Prisma.LeadWhereInput[] = [];
    if (input.emailHash) {
      or.push({ emailHash: input.emailHash });
    }
    if (input.phoneHash) {
      or.push({ phoneHash: input.phoneHash });
    }
    if (input.reference) {
      or.push({ reference: input.reference });
    }
    if (or.length === 0) {
      return [];
    }
    const rows = await this.prisma.lead.findMany({
      where: { anonymizedAt: null, OR: or },
      select: { id: true },
      take: 500,
    });
    return rows.map((row) => row.id);
  }

  async list(filter: LeadListFilter, page: { offset: number; limit: number }): Promise<{ items: AdminLeadRecord[]; total: number }> {
    const where = this.toWhere(filter);
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.lead.count({ where }),
      this.prisma.lead.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: page.offset,
        take: page.limit,
        select: ADMIN_LEAD_SELECT,
      }),
    ]);
    return { items: rows.map((row) => this.toAdminRecord(row)), total };
  }

  async findAdminRecord(id: string): Promise<AdminLeadRecord | null> {
    const row = await this.prisma.lead.findUnique({ where: { id }, select: ADMIN_LEAD_SELECT });
    return row ? this.toAdminRecord(row) : null;
  }

  private toWhere(filter: LeadListFilter): Prisma.LeadWhereInput {
    const where: Prisma.LeadWhereInput = {};
    if (filter.brand) {
      where.brand = filter.brand;
    }
    if (filter.status) {
      where.status = filter.status;
    }
    if (filter.promotionId) {
      where.promotionId = filter.promotionId;
    }
    if (filter.campus) {
      where.campus = filter.campus;
    }
    if (filter.utmCampaign) {
      where.attribution = { is: { utmCampaign: filter.utmCampaign } };
    }
    if (filter.from || filter.to) {
      where.createdAt = { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lt: filter.to } : {}) };
    }
    if (filter.reference) {
      where.reference = filter.reference;
    }
    if (filter.emailHash) {
      where.emailHash = filter.emailHash;
    }
    if (filter.phoneHash) {
      where.phoneHash = filter.phoneHash;
    }
    return where;
  }

  private toAdminRecord(row: AdminLeadRow): AdminLeadRecord {
    const { attribution, consents, ...leadRow } = row;
    const consent = consents[0];
    return {
      lead: this.toProps(leadRow),
      attribution: compactAttribution(attribution),
      consent: consent ? { marketingAccepted: consent.marketingAccepted, privacyVersion: consent.privacyVersion } : null,
    };
  }

  private toProps(row: LeadRow): LeadProps {
    return {
      id: row.id,
      reference: row.reference,
      brand: row.brand,
      promotionId: row.promotionId,
      promotionName: row.promotionName,
      promotionHeadline: row.promotionHeadline,
      priceAmount: row.priceAmount,
      campaignId: row.campaignId,
      campus: row.campus,
      specialties: parseSpecialties(row.specialties),
      fullName: this.codec.open(row.fullName),
      phoneE164: this.codec.open(row.phoneE164),
      phoneHash: row.phoneHash,
      phoneCountry: row.phoneCountry,
      email: this.codec.open(row.email),
      emailHash: row.emailHash,
      experiment:
        row.experimentId && row.experimentVariant ? { id: row.experimentId, variant: row.experimentVariant } : null,
      status: row.status,
      crmContactId: row.crmContactId,
      crmConversationId: row.crmConversationId,
      crmAdvisorName: row.crmAdvisorName,
      crmSyncedAt: row.crmSyncedAt,
      crmConversationLinkedAt: row.crmConversationLinkedAt,
      feedback:
        row.feedbackSource && row.feedbackAt
          ? { source: row.feedbackSource, detail: row.feedbackDetail, receivedAt: row.feedbackAt }
          : null,
      anonymizedAt: row.anonymizedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** Solo el estado que cambian los eventos del CRM (nunca datos personales). */
  private stateData(props: LeadProps): Prisma.LeadUpdateInput {
    return {
      status: props.status,
      crmContactId: props.crmContactId,
      crmConversationId: props.crmConversationId,
      crmAdvisorName: props.crmAdvisorName,
      crmSyncedAt: props.crmSyncedAt,
      crmConversationLinkedAt: props.crmConversationLinkedAt,
      updatedAt: props.updatedAt,
    };
  }

  private outboxData(event: NewOutboxEvent): Prisma.OutboxEventCreateInput {
    return {
      id: event.id,
      name: event.name,
      version: event.version,
      correlationId: event.correlationId,
      payload: this.codec.sealJson(event.payload),
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: event.createdAt,
      createdAt: event.createdAt,
    };
  }
}
