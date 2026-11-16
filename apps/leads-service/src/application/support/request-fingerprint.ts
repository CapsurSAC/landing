import { createHash } from 'node:crypto';
import type { CreateLeadRequest } from '@capsur/api-contracts';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** Serializa con claves ordenadas para que el hash no dependa del orden del JSON. */
function canonicalize(value: unknown): JsonValue {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    const result: { [key: string]: JsonValue } = {};
    for (const [key, v] of entries) {
      result[key] = canonicalize(v);
    }
    return result;
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return String(value);
}

/**
 * Huella sha256 del cuerpo validado y normalizado (sin el honeypot ni el token
 * de captcha, que es de un solo uso). Dos solicitudes con el mismo
 * Idempotency-Key deben tener la misma huella.
 */
export function fingerprintRequest(request: CreateLeadRequest): string {
  const { website: _website, captchaToken: _captchaToken, ...rest } = request;
  const canonical = JSON.stringify(canonicalize(rest));
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Clave de idempotencia con alcance de IP (C19): `sha256(key + ":" + ipHash)`.
 * La misma clave enviada desde otra IP no reproduce la respuesta de otro usuario.
 */
export function scopeIdempotencyKey(idempotencyKey: string, ipHash: string | null): string {
  return createHash('sha256')
    .update(`${idempotencyKey}:${ipHash ?? ''}`)
    .digest('hex');
}

/** Normalización del correo antes de hashear o comparar. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
