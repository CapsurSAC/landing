import { type EventEnvelope, type LeadCreatedPayload } from '@capsur/api-contracts';
import { type Clock } from '../../src/application/ports/clock';
import { type EventPublisher } from '../../src/application/ports/event-publisher';

export class FakeEventPublisher implements EventPublisher {
  readonly published: EventEnvelope[] = [];
  failNext: Error | null = null;

  async publish(envelope: EventEnvelope): Promise<void> {
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = null;
      throw error;
    }
    this.published.push(envelope);
  }

  byName(name: string): EventEnvelope[] {
    return this.published.filter((event) => event.name === name);
  }
}

export class FixedClock implements Clock {
  constructor(private current = new Date('2026-11-13T15:00:00.000Z')) {}

  now(): Date {
    return new Date(this.current);
  }

  advance(ms: number): void {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export const LEAD_ID = '6f1d2c3e-8a4b-4c5d-9e6f-7a8b9c0d1e2f';
export const EVENT_ID = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

export function leadCreatedPayload(overrides: Partial<LeadCreatedPayload> = {}): LeadCreatedPayload {
  return {
    leadId: LEAD_ID,
    reference: 'SIS-7K3M2',
    brand: 'sis',
    fullName: 'María Quispe',
    phone: '+51987654321',
    email: 'maria@example.com',
    campus: 'tacna',
    promotion: { id: 'con-ia', name: 'Computación e Informática con IA', campaignId: 'nov-2026', priceAmount: 24900 },
    specialties: [],
    consent: { contactAccepted: true, marketingAccepted: true, privacyVersion: '2026-11', acceptedAt: '2026-11-13T14:59:00.000Z' },
    attribution: { utmSource: 'meta', utmMedium: 'paid', utmCampaign: 'sis-nov' },
    createdAt: '2026-11-13T14:59:30.000Z',
    ...overrides,
  };
}
