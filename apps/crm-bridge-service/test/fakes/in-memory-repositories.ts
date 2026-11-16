import { type ContactLink, type ConversationLinkPatch, type NewContactLink } from '../../src/domain/contact-link';
import { type SyncJob, type SyncJobCounts, type SyncJobSummary } from '../../src/domain/sync-job';
import {
  type AttemptRepository,
  type ContactLinkRepository,
  type ErasureResult,
  type ErasureTarget,
  type FollowupRepository,
  type FollowupResult,
  type FollowupStatus,
  type FollowupTask,
  type IntegrationAttemptRecord,
  type MetaCapiEventRepository,
  type MetaCapiRecord,
  type MetaCapiStatus,
  type NewWebhookEvent,
  type PersonalDataEraser,
  type ProcessedEventRepository,
  type SyncJobFilter,
  type SyncJobPatch,
  type SyncJobRepository,
  type UpsertSyncJobInput,
  type WebhookEventRepository,
  type WebhookOutcome,
} from '../../src/application/ports/repositories';

export class InMemoryContactLinkRepository implements ContactLinkRepository {
  readonly links = new Map<string, ContactLink>();
  private sequence = 0;

  async findByLeadId(leadId: string): Promise<ContactLink | null> {
    return this.links.get(leadId) ?? null;
  }

  async findByReference(reference: string): Promise<ContactLink | null> {
    return [...this.links.values()].find((link) => link.reference === reference) ?? null;
  }

  async findByCrmContactId(crmContactId: string): Promise<ContactLink | null> {
    return [...this.links.values()].find((link) => link.crmContactId === crmContactId) ?? null;
  }

  async upsert(input: NewContactLink): Promise<ContactLink> {
    const existing = this.links.get(input.leadId);
    const link: ContactLink = {
      id: existing?.id ?? `link-${++this.sequence}`,
      leadId: input.leadId,
      reference: input.reference,
      crmAccountId: input.crmAccountId,
      crmContactId: input.crmContactId,
      crmConversationId: existing?.crmConversationId ?? null,
      crmInboxId: existing?.crmInboxId ?? null,
      assignedTo: existing?.assignedTo ?? null,
      assignedToName: existing?.assignedToName ?? null,
      labels: [...input.labels],
      syncedAt: input.syncedAt,
      conversationLinkedAt: existing?.conversationLinkedAt ?? null,
      autoReplySentAt: existing?.autoReplySentAt ?? null,
      anonymizedAt: existing?.anonymizedAt ?? null,
    };
    this.links.set(link.leadId, link);
    return link;
  }

  async markConversationLinked(leadId: string, patch: ConversationLinkPatch): Promise<ContactLink> {
    const existing = this.links.get(leadId);
    if (!existing) {
      throw new Error(`No existe vínculo para ${leadId}`);
    }
    const updated: ContactLink = { ...existing, ...patch };
    this.links.set(leadId, updated);
    return updated;
  }

  async claimAutoReply(leadId: string, at: Date): Promise<boolean> {
    const existing = this.links.get(leadId);
    if (!existing || existing.autoReplySentAt) {
      return false;
    }
    this.links.set(leadId, { ...existing, autoReplySentAt: at });
    return true;
  }

  async latestSyncedAt(): Promise<Date | null> {
    const dates = [...this.links.values()].map((link) => link.syncedAt.getTime());
    return dates.length > 0 ? new Date(Math.max(...dates)) : null;
  }
}

export class InMemorySyncJobRepository implements SyncJobRepository {
  readonly jobs = new Map<string, SyncJob>();

  async findByLeadId(leadId: string): Promise<SyncJob | null> {
    return this.jobs.get(leadId) ?? null;
  }

  async upsertPending(input: UpsertSyncJobInput): Promise<SyncJob> {
    const now = new Date();
    const existing = this.jobs.get(input.leadId);
    const job: SyncJob = {
      leadId: input.leadId,
      eventId: input.eventId,
      reference: input.reference,
      payload: input.payload,
      status: 'PENDING',
      attempts: input.attempt,
      lastError: existing?.lastError ?? null,
      anonymizedAt: existing?.anonymizedAt ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.jobs.set(job.leadId, job);
    return job;
  }

  async update(leadId: string, patch: SyncJobPatch): Promise<void> {
    const existing = this.jobs.get(leadId);
    if (!existing) {
      throw new Error(`No existe sync_job para ${leadId}`);
    }
    this.jobs.set(leadId, {
      ...existing,
      status: patch.status,
      attempts: patch.attempts ?? existing.attempts,
      lastError: patch.lastError === undefined ? existing.lastError : patch.lastError,
      updatedAt: new Date(),
    });
  }

  async list(filter: SyncJobFilter): Promise<SyncJob[]> {
    return [...this.jobs.values()].filter((job) => !filter.statuses || filter.statuses.includes(job.status)).slice(0, filter.limit);
  }

  async listSummaries(filter: SyncJobFilter): Promise<SyncJobSummary[]> {
    return (await this.list(filter)).map((job) => ({
      leadId: job.leadId,
      reference: job.reference,
      status: job.status,
      attempts: job.attempts,
      lastError: job.lastError,
      updatedAt: job.updatedAt.toISOString(),
    }));
  }

  async countByStatus(): Promise<SyncJobCounts> {
    const counts: SyncJobCounts = { pending: 0, succeeded: 0, failed: 0, dead: 0 };
    for (const job of this.jobs.values()) {
      counts[job.status.toLowerCase() as keyof SyncJobCounts] += 1;
    }
    return counts;
  }
}

export class InMemoryAttemptRepository implements AttemptRepository {
  readonly attempts: IntegrationAttemptRecord[] = [];

  async record(attempt: IntegrationAttemptRecord): Promise<void> {
    this.attempts.push(attempt);
  }
}

export class InMemoryProcessedEventRepository implements ProcessedEventRepository {
  readonly processed = new Map<string, string>();

  async has(eventId: string): Promise<boolean> {
    return this.processed.has(eventId);
  }

  async markProcessed(eventId: string, name: string): Promise<void> {
    this.processed.set(eventId, name);
  }
}

export class InMemoryWebhookEventRepository implements WebhookEventRepository {
  readonly events = new Map<string, NewWebhookEvent & { outcome: WebhookOutcome | null; processedAt: Date | null }>();

  async createIfAbsent(event: NewWebhookEvent): Promise<boolean> {
    if (this.events.has(event.dedupeKey)) {
      return false;
    }
    this.events.set(event.dedupeKey, { ...event, outcome: null, processedAt: null });
    return true;
  }

  async finish(dedupeKey: string, outcome: WebhookOutcome, processedAt: Date): Promise<void> {
    const existing = this.events.get(dedupeKey);
    if (existing) {
      existing.outcome = outcome;
      existing.processedAt = processedAt;
    }
  }
}

export interface FollowupRow {
  leadId: string;
  status: FollowupStatus;
  dueAt: Date;
  attempts: number;
  lockedUntil: Date | null;
  crmConversationId: string | null;
  templateName: string | null;
  lastError: string | null;
  sentAt: Date | null;
}

export class InMemoryFollowupRepository implements FollowupRepository {
  readonly rows = new Map<string, FollowupRow>();

  async schedule(leadId: string, dueAt: Date): Promise<void> {
    if (!this.rows.has(leadId)) {
      this.rows.set(leadId, {
        leadId,
        status: 'PENDING',
        dueAt,
        attempts: 0,
        lockedUntil: null,
        crmConversationId: null,
        templateName: null,
        lastError: null,
        sentAt: null,
      });
    }
  }

  async claimDue(now: Date, limit: number, leaseMs: number): Promise<FollowupTask[]> {
    const due = [...this.rows.values()]
      .filter(
        (row) =>
          (row.status === 'PENDING' && row.dueAt <= now) ||
          (row.status === 'PROCESSING' && row.lockedUntil !== null && row.lockedUntil < now),
      )
      .sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
      .slice(0, limit);
    for (const row of due) {
      row.status = 'PROCESSING';
      row.lockedUntil = new Date(now.getTime() + leaseMs);
    }
    return due.map((row) => ({ leadId: row.leadId, attempts: row.attempts }));
  }

  async complete(leadId: string, result: FollowupResult): Promise<void> {
    const row = this.rows.get(leadId);
    if (!row) {
      throw new Error(`No existe seguimiento para ${leadId}`);
    }
    row.status = result.status;
    row.attempts = result.attempts;
    row.lockedUntil = null;
    row.lastError = result.reason ?? null;
    if (result.crmConversationId !== undefined) row.crmConversationId = result.crmConversationId;
    if (result.templateName !== undefined) row.templateName = result.templateName;
    if (result.dueAt) row.dueAt = result.dueAt;
    if (result.sentAt !== undefined) row.sentAt = result.sentAt;
  }

  async isFollowupConversation(conversationId: string): Promise<boolean> {
    return [...this.rows.values()].some((row) => row.crmConversationId === conversationId);
  }
}

export class InMemoryMetaCapiEventRepository implements MetaCapiEventRepository {
  readonly records = new Map<string, MetaCapiRecord>();

  async findStatus(leadId: string): Promise<MetaCapiStatus | null> {
    return this.records.get(leadId)?.status ?? null;
  }

  async save(record: MetaCapiRecord): Promise<void> {
    this.records.set(record.leadId, { ...record });
  }
}

/** Borrado en memoria sobre los repositorios falsos (mismo contrato que el de Prisma). */
export class InMemoryPersonalDataEraser implements PersonalDataEraser {
  readonly calls: ErasureTarget[] = [];
  failNext: Error | null = null;

  constructor(
    private readonly syncJobs: InMemorySyncJobRepository,
    private readonly contactLinks: InMemoryContactLinkRepository,
    private readonly webhookEvents: InMemoryWebhookEventRepository,
  ) {}

  async erase(target: ErasureTarget, at: Date): Promise<ErasureResult> {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    this.calls.push(target);
    const result: ErasureResult = { syncJobs: 0, contactLinks: 0, webhookEvents: 0, attempts: 0, followups: 0, metaCapiEvents: 0 };
    const job = this.syncJobs.jobs.get(target.leadId);
    if (job) {
      this.syncJobs.jobs.set(target.leadId, { ...job, payload: null, lastError: null, anonymizedAt: at });
      result.syncJobs = 1;
    }
    const link = this.contactLinks.links.get(target.leadId);
    if (link) {
      this.contactLinks.links.set(target.leadId, { ...link, anonymizedAt: at });
      result.contactLinks = 1;
    }
    for (const event of this.webhookEvents.events.values()) {
      if (
        (target.crmContactId && event.contactId === target.crmContactId) ||
        (target.crmConversationId && event.conversationId === target.crmConversationId)
      ) {
        event.payload = { anonymized: true };
        result.webhookEvents += 1;
      }
    }
    return result;
  }
}
