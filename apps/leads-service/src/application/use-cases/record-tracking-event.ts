import type { TrackingEventRequest } from '@capsur/api-contracts';
import type { Clock } from '../ports/clock';
import type { TrackingRepository } from '../ports/tracking-repository';

/** Persiste un evento de tracking autorizado (sin datos personales), con especialidad y experimento (A18). */
export class RecordTrackingEvent {
  constructor(
    private readonly tracking: TrackingRepository,
    private readonly clock: Clock,
  ) {}

  async execute(request: TrackingEventRequest): Promise<void> {
    const receivedAt = this.clock.now();
    await this.tracking.save({
      brand: request.brand,
      event: request.event,
      sessionId: request.sessionId,
      leadId: request.leadId ?? null,
      promotionId: request.promotionId ?? null,
      specialtyId: request.specialtyId ?? null,
      experiment: request.experiment ?? null,
      attribution: request.attribution ?? null,
      occurredAt: request.occurredAt ? new Date(request.occurredAt) : receivedAt,
      receivedAt,
    });
  }
}
