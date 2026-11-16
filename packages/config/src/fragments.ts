import { z } from 'zod';
import { isProductionContext } from './context';

/**
 * Fragmentos Zod reutilizables para variables de entorno. Todos reciben
 * texto (como `process.env`) y devuelven el tipo útil. Los mensajes de error
 * nunca incluyen el valor recibido (puede ser un secreto).
 */

/** Trata `''` (variable definida pero vacía) como no definida. */
export function emptyAsUndefined<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), schema);
}

/** Puerto TCP (1–65535). Uso: `PORT: portSchema.default(3002)`. */
export const portSchema = z.coerce
  .number({ error: 'Debe ser un número de puerto' })
  .int('Debe ser un número entero')
  .min(1, 'Debe estar entre 1 y 65535')
  .max(65535, 'Debe estar entre 1 y 65535');

/** `development` | `test` | `production` (por defecto `development`). */
export const nodeEnvSchema = z.enum(['development', 'test', 'production']).default('development');

/** Niveles de pino (por defecto `info`). */
export const logLevelSchema = z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info');

/** URL de PostgreSQL (`postgresql://` o `postgres://`). */
export const databaseUrlSchema = z.url({
  protocol: /^postgres(ql)?$/,
  error: 'Debe ser una URL postgresql://usuario:clave@host:puerto/base',
});

/** URL de Redis (`redis://` o `rediss://`), opcional: vacía = sin Redis. */
export const redisUrlSchema = emptyAsUndefined(
  z.url({ protocol: /^rediss?$/, error: 'Debe ser una URL redis:// o rediss://' }).optional(),
);

/** URL AMQP (`amqp://` o `amqps://`). */
export const rabbitUrlSchema = z.url({ protocol: /^amqps?$/, error: 'Debe ser una URL amqp:// o amqps://' });

/** DSN de Sentry, opcional: vacío = Sentry desactivado. */
export const sentryDsnSchema = emptyAsUndefined(z.url({ error: 'Debe ser un DSN de Sentry (URL)' }).optional());

/** Texto opcional: vacío = no definido. */
export const optionalStringSchema = emptyAsUndefined(z.string().optional());

/**
 * Lista separada por comas → `string[]` (recorta espacios y descarta vacíos).
 * Variable ausente o vacía = `[]`.
 */
export const csvSchema = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== ''),
  );

/** CSV cuyos elementos se validan con `item`. */
export function csvOf<T extends z.ZodType<unknown, string>>(item: T) {
  return csvSchema.pipe(z.array(item));
}

/** Orígenes CORS en CSV (`https://sis.edu.pe,http://localhost:3000`) → `string[]`. */
export const corsOriginsSchema = csvOf(
  z.string().regex(/^https?:\/\/[^/\s,]+$/, 'Cada origen debe ser esquema://host[:puerto] sin barra final'),
);

/**
 * Bandera booleana: `true`/`false`/`1`/`0` (sin distinguir mayúsculas).
 * Vacía = `false`. Uso: `SWAGGER_ENABLED: booleanFlagSchema.default(false)`.
 */
export const booleanFlagSchema = z.preprocess(
  (value) => (typeof value === 'string' ? (value.trim() === '' ? 'false' : value.trim().toLowerCase()) : value),
  z
    .union([z.boolean(), z.enum(['true', 'false', '1', '0'], { error: 'Debe ser true, false, 1 o 0' })])
    .transform((value) => value === true || value === 'true' || value === '1'),
);

/** Texto JSON validado con `inner`. Uso: `CATALOG_URLS_JSON: jsonSchema(z.record(z.string(), z.url()))`. */
export function jsonSchema<T extends z.ZodType>(inner: T) {
  return z
    .string({ error: 'Debe ser un JSON' })
    .trim()
    .min(1, 'Debe ser un JSON')
    .transform((raw, ctx): unknown => {
      try {
        return JSON.parse(raw) as unknown;
      } catch {
        ctx.addIssue({ code: 'custom', message: 'No es un JSON válido' });
        return z.NEVER;
      }
    })
    .pipe(inner);
}

const BASE64_PATTERN = /^[A-Za-z0-9+/_-]+={0,2}$/;

/** Clave en base64 de exactamente (o al menos) `bytes` bytes; devuelve el texto base64. */
export function base64KeySchema(options: { bytes: number; exact?: boolean }) {
  const exact = options.exact ?? true;
  return z
    .string({ error: 'Debe ser una clave en base64' })
    .trim()
    .superRefine((value, ctx) => {
      if (!BASE64_PATTERN.test(value)) {
        ctx.addIssue({ code: 'custom', message: 'Debe ser una clave en base64' });
        return;
      }
      const length = Buffer.from(value, 'base64').length;
      if (exact ? length !== options.bytes : length < options.bytes) {
        ctx.addIssue({
          code: 'custom',
          message: `Debe decodificar a ${exact ? 'exactamente' : 'al menos'} ${options.bytes} bytes (tiene ${length})`,
        });
      }
    });
}

/**
 * Clave AES-256 en base64 (32 bytes exactos), p. ej. `PII_ENCRYPTION_KEY`.
 * Devuelve el texto base64 validado (lo consume `PiiCipher`).
 */
export const base64Key32Schema = base64KeySchema({ bytes: 32 });

/** Clave HMAC en base64 de al menos 32 bytes, p. ej. `PII_HASH_KEY`. */
export const base64KeyMin32Schema = base64KeySchema({ bytes: 32, exact: false });

const CALLER_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
const MIN_PRODUCTION_TOKEN_LENGTH = 16;

/**
 * `INTERNAL_API_TOKENS`: JSON `{ "<llamador>": "<token>" }` →
 * `Record<string, string>`. En producción (`NODE_ENV=production` en el
 * entorno validado) cada token debe tener al menos 16 caracteres.
 */
export const internalTokensSchema = jsonSchema(
  z.record(
    z.string().regex(CALLER_PATTERN, 'Nombre de llamador inválido (minúsculas, dígitos y guiones)'),
    z.string().trim().min(1, 'El token no puede estar vacío'),
    { error: 'Debe ser un objeto JSON {"<llamador>":"<token>"}' },
  ),
).superRefine((tokens, ctx) => {
  if (!isProductionContext()) {
    return;
  }
  for (const [caller, token] of Object.entries(tokens)) {
    if (token.length < MIN_PRODUCTION_TOKEN_LENGTH) {
      ctx.addIssue({
        code: 'custom',
        message: `En producción el token de "${caller}" debe tener al menos ${MIN_PRODUCTION_TOKEN_LENGTH} caracteres`,
      });
    }
  }
});
