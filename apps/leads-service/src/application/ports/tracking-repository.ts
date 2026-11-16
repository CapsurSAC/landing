import type { Attribution, Brand, ExperimentExposure, TrackingEventName } from '@capsur/api-contracts';

export interface NewTrackingEvent {
  brand: Brand;
  event: TrackingEventName;
  sessionId: string;
  leadId: string | null;
  promotionId: string | null;
  specialtyId: string | null;
  experiment: ExperimentExposure | null;
  attribution: Attribution | null;
  occurredAt: Date;
  receivedAt: Date;
}

export interface TrackingRepository {
  save(event: NewTrackingEvent): Promise<void>;
}

export const TRACKING_REPOSITORY = Symbol('TRACKING_REPOSITORY');
