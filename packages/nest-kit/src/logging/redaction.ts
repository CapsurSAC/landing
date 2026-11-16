/** Texto con el que se sustituyen los valores redactados en logs y Sentry. */
export const REDACTED = '[redactado]';

/**
 * Nombres de campo con datos personales o secretos que se redactan a
 * cualquier profundidad (spec §9 más `consumer` y `captchaToken`).
 */
export const PII_FIELD_NAMES = [
  'fullName',
  'phone',
  'phoneE164',
  'email',
  'phone_number',
  'documentNumber',
  'consumer',
  'captchaToken',
] as const;

/** Cabeceras HTTP sensibles (en minúsculas, como las entrega Node). */
export const SENSITIVE_HEADER_NAMES = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-lead-token',
  'api_access_token',
  'x-api-key',
  'x-revalidate-secret',
  'idempotency-key',
] as const;

/** Profundidad máxima (número de comodines) a la que se buscan campos personales en los logs. */
const MAX_WILDCARD_DEPTH = 4;

function bracket(name: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? `.${name}` : `["${name}"]`;
}

function buildRedactPaths(): string[] {
  const paths = new Set<string>();
  for (const header of SENSITIVE_HEADER_NAMES) {
    paths.add(`req.headers${bracket(header)}`);
    paths.add(`res.headers${bracket(header)}`);
  }
  for (const field of PII_FIELD_NAMES) {
    paths.add(field);
    paths.add(`req.body.${field}`);
    let prefix = '';
    for (let depth = 1; depth <= MAX_WILDCARD_DEPTH; depth += 1) {
      prefix += '*.';
      paths.add(`${prefix}${field}`);
    }
  }
  return [...paths];
}

/**
 * Rutas de redacción de pino comunes a todos los servicios: cabeceras
 * sensibles (`authorization`, `cookie`, `x-lead-token`, `api_access_token`…),
 * `req.body.consumer`, `req.body.captchaToken` y los campos personales
 * (`fullName`, `phone`, `email`, `phone_number`, `documentNumber`) hasta 4
 * niveles de anidamiento.
 */
export const REDACT_PATHS: readonly string[] = Object.freeze(buildRedactPaths());

const PII_KEYS = new Set<string>(PII_FIELD_NAMES);
const SENSITIVE_HEADERS = new Set<string>(SENSITIVE_HEADER_NAMES);

/** `true` si el nombre de campo debe redactarse (campo personal o cabecera sensible). */
export function isSensitiveKey(key: string): boolean {
  return PII_KEYS.has(key) || SENSITIVE_HEADERS.has(key.toLowerCase());
}

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Números con prefijo internacional (+51 987 654 321) o móviles peruanos de 9 dígitos.
const PHONE_PATTERN = /\+\d[\d\s-]{6,16}\d|\b9\d{8}\b/g;

/** Sustituye correos y números de teléfono que aparezcan en texto libre. */
export function scrubText(text: string): string {
  return text.replace(EMAIL_PATTERN, REDACTED).replace(PHONE_PATTERN, REDACTED);
}

/**
 * Copia profunda de `value` con los campos sensibles sustituidos por
 * {@link REDACTED}. Soporta ciclos y limita la profundidad.
 */
export function redactDeep<T>(value: T, maxDepth = 8): T {
  const seen = new WeakMap<object, unknown>();
  const walk = (current: unknown, depth: number): unknown => {
    if (current === null || typeof current !== 'object') {
      return current;
    }
    if (seen.has(current)) {
      return seen.get(current);
    }
    if (depth > maxDepth) {
      return REDACTED;
    }
    if (Array.isArray(current)) {
      const copy: unknown[] = [];
      seen.set(current, copy);
      for (const item of current) {
        copy.push(walk(item, depth + 1));
      }
      return copy;
    }
    const copy: Record<string, unknown> = {};
    seen.set(current, copy);
    for (const [key, item] of Object.entries(current)) {
      copy[key] = isSensitiveKey(key) ? REDACTED : walk(item, depth + 1);
    }
    return copy;
  };
  return walk(value, 0) as T;
}
