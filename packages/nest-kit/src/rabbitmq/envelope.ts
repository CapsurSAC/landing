import { randomUUID } from 'node:crypto';
import type { EventEnvelope } from '@capsur/api-contracts';

export type { EventEnvelope };

/** Puerto de publicación de eventos (lo implementa `RabbitMqPublisher`). */
export interface EventPublisher {
  /** Resuelve solo cuando el broker confirma el mensaje. */
  publish(envelope: EventEnvelope): Promise<void>;
}

/** Token de inyección para el puerto {@link EventPublisher}. */
export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');

/** Metadatos del sobre que aporta quien publica. */
export interface EnvelopeOptions {
  /** Servicio productor (`leads-service`, `crm-bridge-service`). */
  producer: string;
  /** Normalmente el `leadId`. */
  correlationId: string;
  /** Por defecto se deduce del sufijo `.vN` del nombre (o 1). */
  version?: number;
  /** Por defecto un UUID nuevo. Pásalo para republicar el mismo evento (outbox). */
  id?: string;
  /** Por defecto ahora. */
  occurredAt?: Date | string;
}

/** Versión a partir del nombre del evento (`lead.created.v1` → 1). */
export function versionFromEventName(name: string): number {
  const match = /\.v(\d+)$/.exec(name);
  return match?.[1] ? Number(match[1]) : 1;
}

/**
 * Construye un `EventEnvelope` del contrato.
 *
 * @example
 * buildEnvelope(EventNames.LeadCreated, payload, { producer: 'leads-service', correlationId: payload.leadId })
 */
export function buildEnvelope<T>(name: string, payload: T, options: EnvelopeOptions): EventEnvelope<T> {
  const occurredAt =
    options.occurredAt instanceof Date
      ? options.occurredAt.toISOString()
      : (options.occurredAt ?? new Date().toISOString());
  return {
    id: options.id ?? randomUUID(),
    name,
    version: options.version ?? versionFromEventName(name),
    occurredAt,
    producer: options.producer,
    correlationId: options.correlationId,
    payload,
  };
}
