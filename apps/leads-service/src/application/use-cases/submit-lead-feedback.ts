import { randomUUID } from 'node:crypto';
import {
  EventNames,
  LeadFeedbackPayloadSchema,
  type LeadFeedbackPayload,
  type LeadFeedbackRequest,
} from '@capsur/api-contracts';
import { FeedbackAlreadySubmittedError, LeadNotFoundError } from '../../domain/errors';
import type { Clock } from '../ports/clock';
import type { LeadRepository } from '../ports/lead-repository';
import type { AppLogger } from '../ports/logger';
import type { OutboxSignal } from '../ports/notifications';
import type { LeadTokenSigner } from '../support/lead-token';

/**
 * «¿Cómo nos conociste?» (A21): una sola respuesta por lead (409 si ya
 * existe). Se guarda en el lead y se encola `lead.feedback.v1` en la misma
 * transacción. Exige el mismo token que el estado (404 si no coincide).
 */
export class SubmitLeadFeedback {
  constructor(
    private readonly deps: {
      leads: LeadRepository;
      tokens: LeadTokenSigner;
      outboxSignal: OutboxSignal;
      clock: Clock;
      logger: AppLogger;
      idFactory?: () => string;
    },
  ) {}

  async execute(leadId: string, token: string | null | undefined, request: LeadFeedbackRequest): Promise<LeadFeedbackPayload> {
    if (!this.deps.tokens.verify(leadId, token)) {
      throw new LeadNotFoundError(leadId);
    }
    const lead = await this.deps.leads.findById(leadId);
    if (!lead || lead.isAnonymized) {
      throw new LeadNotFoundError(leadId);
    }

    const now = this.deps.clock.now();
    const detail = request.detail && request.detail.length > 0 ? request.detail : null;
    lead.recordFeedback(request.source, detail, now);

    const payload = LeadFeedbackPayloadSchema.parse({
      leadId: lead.id,
      reference: lead.reference,
      source: request.source,
      detail,
      receivedAt: now.toISOString(),
    });
    const saved = await this.deps.leads.saveFeedback(lead, {
      id: (this.deps.idFactory ?? randomUUID)(),
      name: EventNames.LeadFeedbackReceived,
      version: 1,
      correlationId: lead.id,
      payload,
      createdAt: now,
    });
    if (!saved) {
      throw new FeedbackAlreadySubmittedError();
    }
    this.deps.outboxSignal.notify();
    this.deps.logger.info({ leadId: lead.id, source: request.source }, 'Encuesta de origen registrada');
    return payload;
  }
}
