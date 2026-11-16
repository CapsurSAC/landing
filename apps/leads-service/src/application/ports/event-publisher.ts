import type { EventEnvelope } from '@capsur/api-contracts';

/** Publica un sobre de evento y resuelve solo cuando el broker lo confirmó. */
export interface EventPublisher {
  publish(envelope: EventEnvelope): Promise<void>;
}

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
