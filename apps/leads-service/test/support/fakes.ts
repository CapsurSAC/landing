import { createHash } from 'node:crypto';
import type { Attribution, Brand, EventEnvelope } from '@capsur/api-contracts';
import type { Clock } from '../../src/application/ports/clock';
import type {
  CodeFactory,
  ComplaintProps,
  ComplaintRepository,
  ListPage,
  PrivacyRequestProps,
  PrivacyRequestRepository,
} from '../../src/application/ports/compliance-repository';
import type { EventPublisher } from '../../src/application/ports/event-publisher';
import type { CachedSubmission, IdempotencyCache } from '../../src/application/ports/idempotency-cache';
import type {
  AdminLeadRecord,
  CreateLeadAggregate,
  LeadListFilter,
  LeadRepository,
  NewConsentRecord,
  ProcessedEventMark,
} from '../../src/application/ports/lead-repository';
import type { AppLogger } from '../../src/application/ports/logger';
import type {
  DistributedLock,
  MailMessage,
  Mailer,
  NotificationRecord,
  NotificationRepository,
  OutboxSignal,
  TeamNotifier,
} from '../../src/application/ports/notifications';
import type {
  NewOutboxEvent,
  OutboxCounts,
  OutboxEventRecord,
  OutboxRepository,
} from '../../src/application/ports/outbox-repository';
import type { ProcessedEventRepository } from '../../src/application/ports/processed-event-repository';
import type { CatalogPromotion, PromotionCatalog } from '../../src/application/ports/promotion-catalog';
import type { DailyAggregates, FunnelAggregates, ReportRange, ReportRepository } from '../../src/application/ports/report-repository';
import type {
  CaptchaStatus,
  CaptchaVerifier,
  PersonalDataHasher,
  RateLimiter,
  RateLimitResult,
} from '../../src/application/ports/security';
import type { NewSubmission, StoredSubmission, SubmissionRepository } from '../../src/application/ports/submission-repository';
import type { NewTrackingEvent, TrackingRepository } from '../../src/application/ports/tracking-repository';
import type { ComplianceSequenceKind } from '../../src/domain/compliance';
import { CatalogUnavailableError, PromotionNotAvailableError, ReferenceCollisionError } from '../../src/domain/errors';
import { ANONYMIZED_NAME, Lead, type LeadProps } from '../../src/domain/lead';

export interface StoredNotification extends NotificationRecord {
  status: 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
  nextAttemptAt: Date;
  lastError: string | null;
}

/** Almacén compartido por todos los repositorios en memoria. */
export class InMemoryStore {
  leads = new Map<string, LeadProps>();
  consents: Array<NewConsentRecord & { leadId: string }> = [];
  attributions = new Map<string, Attribution>();
  submissions: Array<NewSubmission & { createdAt: Date; snapshotUsable: boolean }> = [];
  outbox = new Map<string, OutboxEventRecord>();
  processedEvents = new Map<string, ProcessedEventMark>();
  tracking: NewTrackingEvent[] = [];
  notifications = new Map<string, StoredNotification>();
  complaints = new Map<string, ComplaintProps>();
  privacyRequests = new Map<string, PrivacyRequestProps>();
  sequences = new Map<string, number>();

  seedLead(props: LeadProps): void {
    this.leads.set(props.id, { ...props, specialties: [...props.specialties] });
  }

  addOutbox(event: NewOutboxEvent): void {
    this.outbox.set(event.id, {
      ...event,
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: event.createdAt,
      publishedAt: null,
      lastError: null,
    });
  }

  outboxByName(name: string): OutboxEventRecord[] {
    return [...this.outbox.values()].filter((event) => event.name === name);
  }

  nextSequence(brand: string, kind: ComplianceSequenceKind, year: number): number {
    const key = `${brand}:${kind}:${year}`;
    const value = (this.sequences.get(key) ?? 0) + 1;
    this.sequences.set(key, value);
    return value;
  }
}

export class InMemoryLeadRepository implements LeadRepository {
  constructor(private readonly store: InMemoryStore) {}

  async findById(id: string): Promise<Lead | null> {
    const props = this.store.leads.get(id);
    return props ? Lead.fromProps(props) : null;
  }

  async findRecentDuplicate(input: { brand: string; phoneHash: string; promotionId: string; since: Date }): Promise<Lead | null> {
    const match = [...this.store.leads.values()]
      .filter(
        (lead) =>
          lead.brand === input.brand &&
          lead.phoneHash === input.phoneHash &&
          lead.promotionId === input.promotionId &&
          lead.createdAt.getTime() >= input.since.getTime(),
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    return match ? Lead.fromProps(match) : null;
  }

  async createWithOutbox(aggregate: CreateLeadAggregate): Promise<void> {
    const collision = [...this.store.leads.values()].some((lead) => lead.reference === aggregate.lead.reference);
    if (collision) {
      throw new ReferenceCollisionError(aggregate.lead.reference);
    }
    this.store.seedLead(aggregate.lead);
    this.store.consents.push({ ...aggregate.consent, leadId: aggregate.lead.id });
    if (aggregate.attribution) {
      this.store.attributions.set(aggregate.lead.id, aggregate.attribution);
    }
    this.store.submissions.push({ ...aggregate.submission, createdAt: aggregate.lead.createdAt, snapshotUsable: true });
    this.store.addOutbox(aggregate.outboxEvent);
    if (aggregate.notification) {
      this.store.notifications.set(aggregate.notification.id, {
        id: aggregate.notification.id,
        leadId: aggregate.lead.id,
        channel: aggregate.notification.channel,
        template: aggregate.notification.template,
        attempts: 0,
        status: 'PENDING',
        nextAttemptAt: aggregate.notification.createdAt,
        lastError: null,
      });
    }
  }

  async save(lead: Lead): Promise<void> {
    this.store.leads.set(lead.id, lead.toProps());
  }

  async saveWithProcessedEvent(lead: Lead, event: ProcessedEventMark): Promise<void> {
    this.store.leads.set(lead.id, lead.toProps());
    this.store.processedEvents.set(event.id, event);
  }

  async markSyncingIfRegistered(leadIds: readonly string[], now: Date): Promise<number> {
    let changed = 0;
    for (const id of leadIds) {
      const lead = this.store.leads.get(id);
      if (lead && lead.status === 'REGISTERED') {
        this.store.leads.set(id, { ...lead, status: 'CRM_SYNCING', updatedAt: now });
        changed += 1;
      }
    }
    return changed;
  }

  async saveFeedback(lead: Lead, outboxEvent: NewOutboxEvent): Promise<boolean> {
    const current = this.store.leads.get(lead.id);
    if (!current || current.feedback !== null) {
      return false;
    }
    this.store.leads.set(lead.id, lead.toProps());
    this.store.addOutbox(outboxEvent);
    return true;
  }

  async saveAnonymized(lead: Lead, outboxEvent: NewOutboxEvent): Promise<void> {
    const props = lead.toProps();
    this.store.leads.set(lead.id, { ...props, fullName: ANONYMIZED_NAME });
    this.store.attributions.delete(lead.id);
    for (const consent of this.store.consents.filter((c) => c.leadId === lead.id)) {
      consent.ipHash = null;
      consent.userAgent = null;
    }
    for (const submission of this.store.submissions.filter((s) => s.leadId === lead.id)) {
      submission.snapshotUsable = false;
    }
    this.store.addOutbox(outboxEvent);
  }

  async findIdsCreatedBefore(createdBefore: Date, limit: number): Promise<string[]> {
    return [...this.store.leads.values()]
      .filter((lead) => lead.anonymizedAt === null && lead.createdAt.getTime() < createdBefore.getTime())
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit)
      .map((lead) => lead.id);
  }

  async findIdsByContact(input: { emailHash?: string | null; phoneHash?: string | null; reference?: string | null }): Promise<string[]> {
    return [...this.store.leads.values()]
      .filter(
        (lead) =>
          lead.anonymizedAt === null &&
          ((input.emailHash && lead.emailHash === input.emailHash) ||
            (input.phoneHash && lead.phoneHash === input.phoneHash) ||
            (input.reference && lead.reference === input.reference)),
      )
      .map((lead) => lead.id);
  }

  async list(filter: LeadListFilter, page: ListPage): Promise<{ items: AdminLeadRecord[]; total: number }> {
    const matches = [...this.store.leads.values()]
      .filter((lead) => {
        const attribution = this.store.attributions.get(lead.id);
        return (
          (!filter.brand || lead.brand === filter.brand) &&
          (!filter.status || lead.status === filter.status) &&
          (!filter.promotionId || lead.promotionId === filter.promotionId) &&
          (!filter.campus || lead.campus === filter.campus) &&
          (!filter.utmCampaign || attribution?.utmCampaign === filter.utmCampaign) &&
          (!filter.from || lead.createdAt >= filter.from) &&
          (!filter.to || lead.createdAt < filter.to) &&
          (!filter.reference || lead.reference === filter.reference) &&
          (!filter.emailHash || lead.emailHash === filter.emailHash) &&
          (!filter.phoneHash || lead.phoneHash === filter.phoneHash)
        );
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return {
      items: matches.slice(page.offset, page.offset + page.limit).map((lead) => this.toRecord(lead)),
      total: matches.length,
    };
  }

  async findAdminRecord(id: string): Promise<AdminLeadRecord | null> {
    const lead = this.store.leads.get(id);
    return lead ? this.toRecord(lead) : null;
  }

  private toRecord(lead: LeadProps): AdminLeadRecord {
    const consent = this.store.consents.filter((c) => c.leadId === lead.id).at(-1);
    return {
      lead: { ...lead },
      attribution: this.store.attributions.get(lead.id) ?? null,
      consent: consent ? { marketingAccepted: consent.marketingAccepted, privacyVersion: consent.privacyVersion } : null,
    };
  }
}

export class InMemorySubmissionRepository implements SubmissionRepository {
  constructor(private readonly store: InMemoryStore) {}

  async findByIdempotencyKey(scopedKey: string): Promise<StoredSubmission | null> {
    const found = this.store.submissions.find((s) => s.idempotencyKey === scopedKey);
    if (!found) {
      return null;
    }
    return {
      leadId: found.leadId,
      requestFingerprint: found.requestFingerprint,
      responseSnapshot: found.snapshotUsable ? found.responseSnapshot : null,
    };
  }

  async record(submission: NewSubmission): Promise<void> {
    this.store.submissions.push({ ...submission, createdAt: new Date(), snapshotUsable: true });
  }
}

export class InMemoryOutboxRepository implements OutboxRepository {
  constructor(private readonly store: InMemoryStore) {}

  async claimPending(limit: number, now: Date, leaseMs: number): Promise<OutboxEventRecord[]> {
    const claimed = [...this.store.outbox.values()]
      .filter((event) => event.status === 'PENDING' && event.nextAttemptAt.getTime() <= now.getTime())
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(0, limit);
    for (const event of claimed) {
      this.store.outbox.set(event.id, { ...event, nextAttemptAt: new Date(now.getTime() + leaseMs) });
    }
    return claimed.map((event) => ({ ...event }));
  }

  async markPublished(ids: readonly string[], publishedAt: Date): Promise<void> {
    for (const id of ids) {
      this.patch(id, { status: 'PUBLISHED', publishedAt, lastError: null });
    }
  }

  async scheduleRetry(id: string, attempts: number, nextAttemptAt: Date, lastError: string): Promise<void> {
    this.patch(id, { status: 'PENDING', attempts, nextAttemptAt, lastError });
  }

  async markFailed(id: string, attempts: number, lastError: string): Promise<void> {
    this.patch(id, { status: 'FAILED', attempts, lastError });
  }

  async counts(): Promise<OutboxCounts> {
    const all = [...this.store.outbox.values()];
    return {
      pending: all.filter((e) => e.status === 'PENDING').length,
      failed: all.filter((e) => e.status === 'FAILED').length,
    };
  }

  private patch(id: string, changes: Partial<OutboxEventRecord>): void {
    const current = this.store.outbox.get(id);
    if (!current) {
      throw new Error(`Evento ${id} no existe`);
    }
    this.store.outbox.set(id, { ...current, ...changes });
  }
}

export class InMemoryProcessedEventRepository implements ProcessedEventRepository {
  constructor(private readonly store: InMemoryStore) {}

  async exists(eventId: string): Promise<boolean> {
    return this.store.processedEvents.has(eventId);
  }

  async record(eventId: string, name: string, processedAt: Date): Promise<void> {
    this.store.processedEvents.set(eventId, { id: eventId, name, processedAt });
  }
}

export class InMemoryTrackingRepository implements TrackingRepository {
  constructor(private readonly store: InMemoryStore) {}

  async save(event: NewTrackingEvent): Promise<void> {
    this.store.tracking.push(event);
  }
}

export class InMemoryComplaintRepository implements ComplaintRepository {
  constructor(private readonly store: InMemoryStore) {}

  async createWithSequence(
    input: Omit<ComplaintProps, 'code'>,
    sequence: { kind: ComplianceSequenceKind; year: number; code: CodeFactory },
  ): Promise<ComplaintProps> {
    const created = { ...input, code: sequence.code(this.store.nextSequence(input.brand, sequence.kind, sequence.year)) };
    this.store.complaints.set(created.id, created);
    return created;
  }

  async findById(id: string): Promise<ComplaintProps | null> {
    return this.store.complaints.get(id) ?? null;
  }

  async list(filter: { brand?: string; status?: ComplaintProps['status'] }, page: ListPage): Promise<{ items: ComplaintProps[]; total: number }> {
    const all = [...this.store.complaints.values()].filter(
      (c) => (!filter.brand || c.brand === filter.brand) && (!filter.status || c.status === filter.status),
    );
    return { items: all.slice(page.offset, page.offset + page.limit), total: all.length };
  }

  async saveResponse(id: string, input: { response: string; respondedAt: Date; respondedBy: string | null }): Promise<void> {
    const current = this.store.complaints.get(id);
    if (current) {
      this.store.complaints.set(id, { ...current, status: 'answered', ...input });
    }
  }
}

export class InMemoryPrivacyRequestRepository implements PrivacyRequestRepository {
  constructor(private readonly store: InMemoryStore) {}

  async createWithSequence(
    input: Omit<PrivacyRequestProps, 'code'>,
    sequence: { kind: ComplianceSequenceKind; year: number; code: CodeFactory },
  ): Promise<PrivacyRequestProps> {
    const created = { ...input, code: sequence.code(this.store.nextSequence(input.brand, sequence.kind, sequence.year)) };
    this.store.privacyRequests.set(created.id, created);
    return created;
  }

  async findById(id: string): Promise<PrivacyRequestProps | null> {
    return this.store.privacyRequests.get(id) ?? null;
  }

  async list(
    filter: { brand?: string; status?: PrivacyRequestProps['status'] },
    page: ListPage,
  ): Promise<{ items: PrivacyRequestProps[]; total: number }> {
    const all = [...this.store.privacyRequests.values()].filter(
      (r) => (!filter.brand || r.brand === filter.brand) && (!filter.status || r.status === filter.status),
    );
    return { items: all.slice(page.offset, page.offset + page.limit), total: all.length };
  }

  async saveResolution(
    id: string,
    input: { status: PrivacyRequestProps['status']; resolution: string; resolvedAt: Date | null; resolvedBy: string | null },
  ): Promise<void> {
    const current = this.store.privacyRequests.get(id);
    if (current) {
      this.store.privacyRequests.set(id, { ...current, ...input });
    }
  }
}

export class InMemoryNotificationRepository implements NotificationRepository {
  constructor(private readonly store: InMemoryStore) {}

  async claimPending(limit: number, now: Date, leaseMs: number): Promise<NotificationRecord[]> {
    const claimed = [...this.store.notifications.values()]
      .filter((n) => n.status === 'PENDING' && n.nextAttemptAt.getTime() <= now.getTime())
      .slice(0, limit);
    for (const notification of claimed) {
      notification.nextAttemptAt = new Date(now.getTime() + leaseMs);
    }
    return claimed.map(({ id, leadId, channel, template, attempts }) => ({ id, leadId, channel, template, attempts }));
  }

  async markSent(id: string): Promise<void> {
    this.patch(id, { status: 'SENT', lastError: null });
  }

  async scheduleRetry(id: string, attempts: number, nextAttemptAt: Date, lastError: string): Promise<void> {
    this.patch(id, { status: 'PENDING', attempts, nextAttemptAt, lastError });
  }

  async markFailed(id: string, attempts: number, lastError: string): Promise<void> {
    this.patch(id, { status: 'FAILED', attempts, lastError });
  }

  async markSkipped(id: string, reason: string): Promise<void> {
    this.patch(id, { status: 'SKIPPED', lastError: reason });
  }

  private patch(id: string, changes: Partial<StoredNotification>): void {
    const current = this.store.notifications.get(id);
    if (!current) {
      throw new Error(`Notificación ${id} no existe`);
    }
    this.store.notifications.set(id, { ...current, ...changes });
  }
}

export class FakeReportRepository implements ReportRepository {
  readonly calls: Array<{ kind: 'funnel' | 'daily'; range: ReportRange }> = [];

  constructor(
    public funnelResult: FunnelAggregates = {
      sessionsByEvent: {},
      crmSynced: 0,
      conversationLinked: 0,
      byPromotion: [],
      byCampaign: [],
      byFeedbackSource: [],
      experimentExposures: [],
      experimentSubmissions: [],
      daily: [],
    },
    public dailyResult: DailyAggregates = {
      leads: 0,
      duplicates: 0,
      crmSynced: 0,
      crmFailed: 0,
      conversationsLinked: 0,
      topPromotion: null,
      topCampaign: null,
    },
  ) {}

  async funnel(range: ReportRange): Promise<FunnelAggregates> {
    this.calls.push({ kind: 'funnel', range });
    return this.funnelResult;
  }

  async daily(range: ReportRange): Promise<DailyAggregates> {
    this.calls.push({ kind: 'daily', range });
    return this.dailyResult;
  }
}

export class FakePromotionCatalog implements PromotionCatalog {
  readonly promotions = new Map<string, CatalogPromotion>();
  /** Si está activo, simula que el catálogo no responde. */
  unavailable = false;

  constructor(promotions: CatalogPromotion[] = []) {
    for (const promotion of promotions) {
      this.promotions.set(`${promotion.brand}:${promotion.id}`, promotion);
    }
  }

  async validate(promotionId: string, brand: Brand): Promise<CatalogPromotion> {
    if (this.unavailable) {
      throw new CatalogUnavailableError(new Error('ECONNREFUSED'));
    }
    const promotion = this.promotions.get(`${brand}:${promotionId}`);
    if (!promotion) {
      throw new PromotionNotAvailableError(promotionId);
    }
    return promotion;
  }
}

export class FakeIdempotencyCache implements IdempotencyCache {
  readonly entries = new Map<string, CachedSubmission>();
  /** Simula Redis caído: todas las operaciones fallan. */
  failing = false;
  reads = 0;

  async get(scopedKey: string): Promise<CachedSubmission | null> {
    this.reads += 1;
    if (this.failing) {
      throw new Error('Redis no disponible');
    }
    return this.entries.get(scopedKey) ?? null;
  }

  async set(scopedKey: string, value: CachedSubmission): Promise<void> {
    if (this.failing) {
      throw new Error('Redis no disponible');
    }
    this.entries.set(scopedKey, value);
  }
}

export class FakeEventPublisher implements EventPublisher {
  readonly published: EventEnvelope[] = [];
  failWith: Error | null = null;
  /** Ids de evento que fallan al publicar (simula nacks parciales del broker). */
  readonly failingIds = new Set<string>();

  async publish(envelope: EventEnvelope): Promise<void> {
    if (this.failWith) {
      throw this.failWith;
    }
    if (this.failingIds.has(envelope.id)) {
      throw new Error('El broker rechazó la publicación');
    }
    this.published.push(envelope);
  }
}

export class FakeRateLimiter implements RateLimiter {
  readonly hits = new Map<string, number>();

  async consume(key: string, limit: number): Promise<RateLimitResult> {
    const total = (this.hits.get(key) ?? 0) + 1;
    this.hits.set(key, total);
    return total > limit ? { allowed: false, retryAfterMs: 1_800_000 } : { allowed: true, retryAfterMs: 0 };
  }
}

export class FakeCaptchaVerifier implements CaptchaVerifier {
  status: CaptchaStatus = 'skipped';
  readonly calls: Array<{ token: string | null | undefined; remoteIp: string | null }> = [];

  async verify(token: string | null | undefined, remoteIp: string | null): Promise<CaptchaStatus> {
    this.calls.push({ token, remoteIp });
    return this.status;
  }
}

/** Hash determinista para pruebas (no es el HMAC real, pero conserva la igualdad). */
export class FakeHasher implements PersonalDataHasher {
  hash(normalizedValue: string): string {
    return createHash('sha256').update(`test:${normalizedValue}`).digest('hex');
  }
}

export class FakeOutboxSignal implements OutboxSignal {
  notifications = 0;
  private readonly listeners = new Set<() => void>();

  notify(): void {
    this.notifications += 1;
    for (const listener of this.listeners) {
      listener();
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export class FakeMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  failWith: Error | null = null;

  async send(message: MailMessage): Promise<void> {
    if (this.failWith) {
      throw this.failWith;
    }
    this.sent.push(message);
  }
}

export class FakeTeamNotifier implements TeamNotifier {
  readonly texts: string[] = [];
  failWith: Error | null = null;

  async postText(text: string): Promise<void> {
    if (this.failWith) {
      throw this.failWith;
    }
    this.texts.push(text);
  }
}

export class FakeLock implements DistributedLock {
  readonly held = new Set<string>();

  async acquire(key: string): Promise<boolean> {
    if (this.held.has(key)) {
      return false;
    }
    this.held.add(key);
    return true;
  }

  async release(key: string): Promise<void> {
    this.held.delete(key);
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  set(date: Date): void {
    this.current = date;
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class SilentLogger implements AppLogger {
  readonly entries: Array<{ level: string; context: Record<string, unknown>; message: string }> = [];

  debug(context: Record<string, unknown>, message: string): void {
    this.entries.push({ level: 'debug', context, message });
  }

  info(context: Record<string, unknown>, message: string): void {
    this.entries.push({ level: 'info', context, message });
  }

  warn(context: Record<string, unknown>, message: string): void {
    this.entries.push({ level: 'warn', context, message });
  }

  error(context: Record<string, unknown>, message: string): void {
    this.entries.push({ level: 'error', context, message });
  }
}

export const ACTIVE_PROMOTION: CatalogPromotion = {
  id: 'con-ia',
  brand: 'sis',
  name: 'CON IA',
  headline: 'S/249',
  price: { amount: 24900, currency: 'PEN' },
  active: true,
  campaignId: 'lanzamiento-2026',
  specialtiesIncluded: 2,
  allowedSpecialties: [
    { id: 'desarrollo-software-ia', name: 'Desarrollo de Software con IA', track: 'ia' },
    { id: 'marketing-digital-ia', name: 'Marketing Digital con IA', track: 'ia' },
    { id: 'ciencia-datos-ia', name: 'Ciencia de Datos con IA', track: 'ia' },
  ],
};

/** Promoción tal como la devuelve promotions-service antes de publicar especialidades (A3). */
export const LEGACY_PROMOTION: CatalogPromotion = {
  id: 'tradicional',
  brand: 'sis',
  name: 'TRADICIONAL',
  headline: 'S/199',
  price: { amount: 19900, currency: 'PEN' },
  active: true,
  campaignId: null,
};

export const INACTIVE_PROMOTION: CatalogPromotion = {
  ...ACTIVE_PROMOTION,
  id: 'inactiva',
  name: 'INACTIVA',
  active: false,
};

export function leadFixture(overrides: Partial<LeadProps> = {}): LeadProps {
  const now = new Date('2026-11-13T10:00:00.000Z');
  const hasher = new FakeHasher();
  return {
    id: '5c0f2d8e-1a2b-4c3d-9e8f-0a1b2c3d4e5f',
    reference: 'SIS-7K3M2',
    brand: 'sis',
    promotionId: 'con-ia',
    promotionName: 'CON IA',
    promotionHeadline: 'S/249',
    priceAmount: 24900,
    campaignId: 'lanzamiento-2026',
    campus: 'tacna',
    specialties: [],
    fullName: 'Ana María Quispe',
    phoneE164: '+51987654321',
    phoneHash: hasher.hash('+51987654321'),
    phoneCountry: 'PE',
    email: 'ana@example.com',
    emailHash: hasher.hash('ana@example.com'),
    experiment: null,
    status: 'REGISTERED',
    crmContactId: null,
    crmConversationId: null,
    crmAdvisorName: null,
    crmSyncedAt: null,
    crmConversationLinkedAt: null,
    feedback: null,
    anonymizedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
