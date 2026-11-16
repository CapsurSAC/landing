import { randomUUID } from 'node:crypto';
import { EventNames, LeadAnonymizedPayloadSchema, type LeadAnonymizedPayload } from '@capsur/api-contracts';
import { LeadNotFoundError } from '../../domain/errors';
import type { Clock } from '../ports/clock';
import type { LeadRepository } from '../ports/lead-repository';
import type { AppLogger } from '../ports/logger';
import type { OutboxSignal } from '../ports/notifications';

export type AnonymizationReason = LeadAnonymizedPayload['reason'];

export interface AnonymizeLeadResult {
  leadId: string;
  /** `false` si el lead ya estaba anonimizado (no se vuelve a publicar el evento). */
  anonymized: boolean;
}

/**
 * Anonimiza un lead (C9) y encola `lead.anonymized.v1` en la misma
 * transacción. Lo usan la retención diaria, el panel (A2) y la resolución de
 * solicitudes ARCO. Idempotente.
 */
export class AnonymizeLead {
  constructor(
    private readonly deps: {
      leads: LeadRepository;
      outboxSignal: OutboxSignal;
      clock: Clock;
      logger: AppLogger;
      idFactory?: () => string;
    },
  ) {}

  async execute(leadId: string, options: { reason: AnonymizationReason; deleteCrmContact: boolean }): Promise<AnonymizeLeadResult> {
    const lead = await this.deps.leads.findById(leadId);
    if (!lead) {
      throw new LeadNotFoundError(leadId);
    }
    const now = this.deps.clock.now();
    if (!lead.anonymize(now)) {
      return { leadId, anonymized: false };
    }

    const payload = LeadAnonymizedPayloadSchema.parse({
      leadId: lead.id,
      reference: lead.reference,
      reason: options.reason,
      deleteCrmContact: options.deleteCrmContact,
      anonymizedAt: now.toISOString(),
    });
    await this.deps.leads.saveAnonymized(lead, {
      id: (this.deps.idFactory ?? randomUUID)(),
      name: EventNames.LeadAnonymized,
      version: 1,
      correlationId: lead.id,
      payload,
      createdAt: now,
    });
    this.deps.outboxSignal.notify();
    this.deps.logger.info({ leadId: lead.id, reason: options.reason }, 'Lead anonimizado');
    return { leadId, anonymized: true };
  }
}

/**
 * Retención diaria (C9): anonimiza en lotes los leads con más de
 * `retentionDays` días. Un fallo en un lead no detiene el resto.
 */
export class AnonymizeExpiredLeads {
  constructor(
    private readonly deps: {
      leads: LeadRepository;
      anonymizeLead: AnonymizeLead;
      clock: Clock;
      logger: AppLogger;
      retentionDays: number;
      batchSize?: number;
      maxBatches?: number;
    },
  ) {}

  async execute(): Promise<{ anonymized: number; failed: number }> {
    const cutoff = new Date(this.deps.clock.now().getTime() - this.deps.retentionDays * 24 * 60 * 60 * 1000);
    const batchSize = this.deps.batchSize ?? 100;
    const maxBatches = this.deps.maxBatches ?? 50;
    let anonymized = 0;
    let failed = 0;
    const failedIds = new Set<string>();

    for (let batch = 0; batch < maxBatches; batch += 1) {
      const ids = (await this.deps.leads.findIdsCreatedBefore(cutoff, batchSize + failedIds.size)).filter(
        (id) => !failedIds.has(id),
      );
      if (ids.length === 0) {
        break;
      }
      for (const id of ids.slice(0, batchSize)) {
        try {
          const result = await this.deps.anonymizeLead.execute(id, { reason: 'retention', deleteCrmContact: false });
          if (result.anonymized) {
            anonymized += 1;
          }
        } catch (error) {
          failed += 1;
          failedIds.add(id);
          this.deps.logger.error({ leadId: id, err: error }, 'No se pudo anonimizar un lead vencido');
        }
      }
      if (ids.length < batchSize) {
        break;
      }
    }

    this.deps.logger.info(
      { anonymized, failed, cutoff: cutoff.toISOString(), retentionDays: this.deps.retentionDays },
      'Retención de leads completada',
    );
    return { anonymized, failed };
  }
}
