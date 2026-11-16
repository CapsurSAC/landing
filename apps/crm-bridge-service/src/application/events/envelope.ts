import { type EventEnvelope } from '@capsur/api-contracts';
import { buildEnvelope } from '@capsur/nest-kit';

export const PRODUCER_NAME = 'crm-bridge-service';

/** Sobre de los eventos publicados por este servicio (delegado en `buildEnvelope` del kit). */
export function crmEnvelope<T>(name: string, correlationId: string, payload: T, occurredAt: Date): EventEnvelope<T> {
  return buildEnvelope(name, payload, { producer: PRODUCER_NAME, correlationId, occurredAt });
}
