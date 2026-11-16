import { EventEnvelopeSchema } from '@capsur/api-contracts';
import { type ConsumeMessage, type MessagePropertyHeaders } from 'amqplib';
import { type ZodType } from 'zod';

/**
 * Número de intento a partir de la cabecera `x-death`: rechazos (`nack` sin reencolar) que ya
 * hizo la cola `queue` + 1. Lo escribe el broker al hacer dead-letter.
 */
export function readAttempt(headers: MessagePropertyHeaders | undefined, queue: string): number {
  const deaths: unknown = headers?.['x-death'];
  if (!Array.isArray(deaths)) {
    return 1;
  }
  let rejected = 0;
  for (const death of deaths) {
    if (typeof death === 'object' && death !== null && 'queue' in death && 'reason' in death && 'count' in death) {
      const { queue: deathQueue, reason, count } = death as { queue: unknown; reason: unknown; count: unknown };
      if (deathQueue === queue && reason === 'rejected' && Number.isFinite(Number(count))) {
        rejected += Number(count);
      }
    }
  }
  return rejected + 1;
}

export type ParseResult<T> =
  | { ok: true; eventId: string; payload: T }
  | { ok: false; reason: 'not_json' | 'invalid_envelope' | 'unexpected_event' | 'invalid_payload'; detail?: unknown };

/**
 * Valida sobre y payload de un mensaje. Nunca devuelve el contenido en los errores
 * (puede llevar datos personales): solo rutas de los campos inválidos.
 */
export function parseEventMessage<T>(message: ConsumeMessage, expectedName: string, payloadSchema: ZodType<T>): ParseResult<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(message.content.toString('utf8'));
  } catch {
    return { ok: false, reason: 'not_json' };
  }
  const envelope = EventEnvelopeSchema.safeParse(raw);
  if (!envelope.success) {
    return { ok: false, reason: 'invalid_envelope', detail: envelope.error.issues.map((issue) => issue.path.join('.')) };
  }
  if (envelope.data.name !== expectedName) {
    return { ok: false, reason: 'unexpected_event', detail: envelope.data.name };
  }
  const payload = payloadSchema.safeParse(envelope.data.payload);
  if (!payload.success) {
    return { ok: false, reason: 'invalid_payload', detail: payload.error.issues.map((issue) => issue.path.join('.')) };
  }
  return { ok: true, eventId: envelope.data.id, payload: payload.data };
}

/** Propiedades AMQP del original para reenviarlo (DLX/DLQ) con cabeceras de diagnóstico. */
export function forwardProperties(
  message: ConsumeMessage,
  extraHeaders: Record<string, string | number>,
): {
  persistent: true;
  contentType: string;
  contentEncoding: string | undefined;
  messageId: string | undefined;
  correlationId: string | undefined;
  type: string | undefined;
  appId: string | undefined;
  timestamp: number | undefined;
  headers: MessagePropertyHeaders;
} {
  const properties = message.properties;
  return {
    persistent: true,
    contentType: typeof properties.contentType === 'string' ? properties.contentType : 'application/json',
    contentEncoding: typeof properties.contentEncoding === 'string' ? properties.contentEncoding : undefined,
    messageId: typeof properties.messageId === 'string' ? properties.messageId : undefined,
    correlationId: typeof properties.correlationId === 'string' ? properties.correlationId : undefined,
    type: typeof properties.type === 'string' ? properties.type : undefined,
    appId: typeof properties.appId === 'string' ? properties.appId : undefined,
    timestamp: typeof properties.timestamp === 'number' ? properties.timestamp : undefined,
    headers: { ...(properties.headers ?? {}), ...extraHeaders },
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms).unref();
  });
}
