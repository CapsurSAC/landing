import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

/** Cabecera de correlación aceptada y devuelta por todos los servicios. */
export const REQUEST_ID_HEADER = 'x-request-id';

const MAX_REQUEST_ID_LENGTH = 128;
const REQUEST_ID_PATTERN = /^[\w.-]+$/;

/** `true` si el valor entrante es un id de petición aceptable (evita inyección en logs). */
export function isValidRequestId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_REQUEST_ID_LENGTH &&
    REQUEST_ID_PATTERN.test(value)
  );
}

/**
 * `genReqId` para pino-http: reutiliza el `x-request-id` entrante si es
 * válido; si no, genera un UUID. Siempre lo devuelve en la respuesta.
 */
export function resolveRequestId(req: IncomingMessage, res: ServerResponse): string {
  const incoming = req.headers[REQUEST_ID_HEADER];
  const candidate = Array.isArray(incoming) ? incoming[0] : incoming;
  const requestId = isValidRequestId(candidate) ? candidate : randomUUID();
  if (!res.headersSent) {
    res.setHeader(REQUEST_ID_HEADER, requestId);
  }
  return requestId;
}
