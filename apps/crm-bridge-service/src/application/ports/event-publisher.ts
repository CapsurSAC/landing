import { type EventEnvelope } from '@capsur/api-contracts';

/** Publicación de eventos de integración en `capsur.events` (routing key = nombre del evento). */
export interface EventPublisher {
  publish(envelope: EventEnvelope): Promise<void>;
}
