import {
  CrmContactSyncedPayloadSchema,
  CrmConversationLinkedPayloadSchema,
  CrmSyncFailedPayloadSchema,
  EventNames,
  type EventEnvelope,
} from '@capsur/api-contracts';
import type { ZodType } from 'zod';
import { InvalidEventPayloadError, InvalidStateTransitionError } from '../../domain/errors';
import type { Lead } from '../../domain/lead';
import type { Clock } from '../ports/clock';
import type { LeadRepository } from '../ports/lead-repository';
import type { AppLogger } from '../ports/logger';
import type { ProcessedEventRepository } from '../ports/processed-event-repository';

export type ApplyCrmStatusOutcome = 'applied' | 'already_processed' | 'ignored';

/**
 * Aplica un evento `crm.*` al lead correspondiente de forma idempotente:
 * el id del evento se guarda en `processed_events` en la misma transacción
 * que la actualización del lead.
 */
export class ApplyCrmStatusEvent {
  constructor(
    private readonly leads: LeadRepository,
    private readonly processedEvents: ProcessedEventRepository,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  async execute(envelope: EventEnvelope): Promise<ApplyCrmStatusOutcome> {
    if (await this.processedEvents.exists(envelope.id)) {
      this.logger.debug({ eventId: envelope.id, event: envelope.name }, 'Evento ya procesado');
      return 'already_processed';
    }

    const now = this.clock.now();

    switch (envelope.name) {
      case EventNames.CrmContactSynced: {
        const payload = this.parse(envelope, CrmContactSyncedPayloadSchema);
        return this.applyToLead(envelope, payload.leadId, now, (lead) => {
          lead.markCrmSynced(payload.crmContactId, new Date(payload.syncedAt), now);
        });
      }
      case EventNames.CrmConversationLinked: {
        const payload = this.parse(envelope, CrmConversationLinkedPayloadSchema);
        return this.applyToLead(envelope, payload.leadId, now, (lead) => {
          lead.linkCrmConversation({
            crmContactId: payload.crmContactId,
            crmConversationId: payload.crmConversationId,
            // Nombre visible del asesor (lo muestra GET /api/v1/leads/:id/status).
            advisorName: payload.assignedToName ?? null,
            linkedAt: new Date(payload.linkedAt),
            now,
          });
        });
      }
      case EventNames.CrmSyncFailed: {
        const payload = this.parse(envelope, CrmSyncFailedPayloadSchema);
        return this.applyToLead(envelope, payload.leadId, now, (lead) => {
          lead.markCrmFailed(now);
        });
      }
      default: {
        // La cola está ligada a `crm.#`: eventos futuros se ignoran sin fallar.
        this.logger.warn({ eventId: envelope.id, event: envelope.name }, 'Evento CRM no soportado; se ignora');
        await this.processedEvents.record(envelope.id, envelope.name, now);
        return 'ignored';
      }
    }
  }

  private parse<T>(envelope: EventEnvelope, schema: ZodType<T>): T {
    const result = schema.safeParse(envelope.payload);
    if (!result.success) {
      const detail = result.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ');
      throw new InvalidEventPayloadError(envelope.name, detail);
    }
    return result.data;
  }

  private async applyToLead(
    envelope: EventEnvelope,
    leadId: string,
    now: Date,
    mutate: (lead: Lead) => void,
  ): Promise<ApplyCrmStatusOutcome> {
    const lead = await this.leads.findById(leadId);
    if (!lead) {
      this.logger.warn({ eventId: envelope.id, event: envelope.name, leadId }, 'Lead inexistente; se ignora el evento');
      await this.processedEvents.record(envelope.id, envelope.name, now);
      return 'ignored';
    }

    try {
      mutate(lead);
    } catch (error) {
      if (error instanceof InvalidStateTransitionError) {
        this.logger.warn(
          { eventId: envelope.id, event: envelope.name, leadId, from: error.from, to: error.to },
          'Transición de estado no permitida; se ignora el evento',
        );
        await this.processedEvents.record(envelope.id, envelope.name, now);
        return 'ignored';
      }
      throw error;
    }

    await this.leads.saveWithProcessedEvent(lead, {
      id: envelope.id,
      name: envelope.name,
      processedAt: now,
    });
    this.logger.info({ eventId: envelope.id, event: envelope.name, leadId, status: lead.status }, 'Evento CRM aplicado');
    return 'applied';
  }
}
