/**
 * Definición del entorno de crm-bridge-service (B25). Sin efectos al importar: la lee el CLI
 * `capsur-env-example` para generar `.env.example`. La carga validada está en `env.ts`.
 */
import { isIP } from 'node:net';
import { CampusSchema } from '@capsur/api-contracts';
import {
  base64Key32Schema,
  booleanFlagSchema,
  csvOf,
  csvSchema,
  databaseUrlSchema,
  defineEnv,
  emptyAsUndefined,
  internalTokensSchema,
  jsonSchema,
  logLevelSchema,
  nodeEnvSchema,
  optionalStringSchema,
  portSchema,
  rabbitUrlSchema,
  sentryDsnSchema,
  type EnvOf,
} from '@capsur/config';
import { z } from 'zod';
import { AssignmentRulesSchema } from '../domain/assignment-policy';

/** IP (v4 o v6) o red CIDR (`10.0.0.0/8`, `2001:db8::/32`). */
export function isIpOrCidr(value: string): boolean {
  const [address = '', prefix, ...rest] = value.split('/');
  if (rest.length > 0) {
    return false;
  }
  const family = isIP(address);
  if (family === 0) {
    return false;
  }
  if (prefix === undefined) {
    return true;
  }
  if (!/^\d{1,3}$/.test(prefix)) {
    return false;
  }
  return Number(prefix) <= (family === 4 ? 32 : 128);
}

const positiveInt = z.coerce.number({ error: 'Debe ser un número entero positivo' }).int().positive();
const optionalPositiveInt = emptyAsUndefined(positiveInt.optional());

export const envDefinition = defineEnv(
  {
    NODE_ENV: nodeEnvSchema,
    PORT: portSchema.default(3003),
    LOG_LEVEL: logLevelSchema,
    DATABASE_URL: databaseUrlSchema,
    RABBITMQ_URL: rabbitUrlSchema,
    INTERNAL_API_TOKENS: internalTokensSchema,
    SWAGGER_ENABLED: booleanFlagSchema.default(false),
    SENTRY_DSN: sentryDsnSchema,
    SENTRY_ENVIRONMENT: optionalStringSchema,
    PII_ENCRYPTION_KEY: base64Key32Schema,

    CHATWOOT_BASE_URL: z.url({ protocol: /^https?$/, error: 'Debe ser una URL http(s) sin /api' }),
    CHATWOOT_BASE_URL_ALLOWLIST: csvSchema,
    CHATWOOT_ACCOUNT_ID: z.string().trim().min(1, 'No puede estar vacío'),
    CHATWOOT_INBOX_ID: positiveInt,
    CHATWOOT_INBOX_ID_BY_CAMPUS: emptyAsUndefined(jsonSchema(z.partialRecord(CampusSchema, positiveInt)).optional()).transform(
      (value) => value ?? {},
    ),
    CHATWOOT_API_ACCESS_TOKEN: z.string().trim().min(1, 'No puede estar vacío'),
    CHATWOOT_WEBHOOK_SECRET: z.string().trim().min(1, 'No puede estar vacío'),
    CHATWOOT_WEBHOOK_SECRET_PREVIOUS: optionalStringSchema,
    WEBHOOK_IP_ALLOWLIST: csvOf(z.string().refine(isIpOrCidr, 'Cada entrada debe ser una IP o un CIDR (IPv4/IPv6)')),
    CHATWOOT_DEFAULT_TEAM_ID: optionalPositiveInt,
    ASSIGNMENT_RULES_JSON: emptyAsUndefined(jsonSchema(AssignmentRulesSchema).optional()).transform((value) => value ?? []),
    ASSIGNMENT_STRATEGY: emptyAsUndefined(z.enum(['round_robin', 'least_loaded']).optional()).transform(
      (value) => value ?? 'round_robin',
    ),
    CHATWOOT_AUTO_REPLY_ENABLED: booleanFlagSchema.default(false),
    CATALOG_URLS_JSON: emptyAsUndefined(jsonSchema(z.record(z.string(), z.url({ protocol: /^https?$/ }))).optional()).transform(
      (value) => value ?? {},
    ),

    WHATSAPP_FOLLOWUP_ENABLED: booleanFlagSchema.default(false),
    WHATSAPP_FOLLOWUP_TEMPLATE_NAME: optionalStringSchema,
    WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE: emptyAsUndefined(z.string().trim().min(2).max(10).optional()).transform(
      (value) => value ?? 'es',
    ),
    WHATSAPP_FOLLOWUP_AFTER_HOURS: emptyAsUndefined(positiveInt.max(24 * 30).optional()).transform((value) => value ?? 24),

    META_PIXEL_ID: optionalStringSchema,
    META_CAPI_ACCESS_TOKEN: optionalStringSchema,
    META_CAPI_TEST_EVENT_CODE: optionalStringSchema,
    META_GRAPH_BASE_URL: emptyAsUndefined(z.url({ protocol: /^https?$/ }).optional()).transform(
      (value) => value ?? 'https://graph.facebook.com/v21.0',
    ),

    MAX_SYNC_ATTEMPTS: emptyAsUndefined(positiveInt.optional()).transform((value) => value ?? 5),
  },
  {
    title: 'crm-bridge-service: variables de entorno (desarrollo). Generado con `pnpm env:example`.',
    examples: {
      NODE_ENV: 'development',
      PORT: '3003',
      LOG_LEVEL: 'debug',
      DATABASE_URL: 'postgresql://crm_bridge:crm_bridge@localhost:5432/crm_bridge?schema=public',
      RABBITMQ_URL: 'amqp://crm_bridge_svc:crm_bridge_svc_local@localhost:5672',
      INTERNAL_API_TOKENS: '{"admin-web":"dev-admin-to-crm","ops":"dev-ops-to-crm"}',
      SWAGGER_ENABLED: 'false',
      SENTRY_DSN: '',
      SENTRY_ENVIRONMENT: 'local',
      PII_ENCRYPTION_KEY: 'ZGV2LW9ubHktcGlpLWtleS0zMi1ieXRlcy1sb25nISE=',
      CHATWOOT_BASE_URL: 'https://chatwoot.example.com',
      CHATWOOT_BASE_URL_ALLOWLIST: 'chatwoot.example.com',
      CHATWOOT_ACCOUNT_ID: '1',
      CHATWOOT_INBOX_ID: '1',
      CHATWOOT_INBOX_ID_BY_CAMPUS: '{"tacna":1}',
      CHATWOOT_API_ACCESS_TOKEN: 'change-me',
      CHATWOOT_WEBHOOK_SECRET: 'change-me',
      CHATWOOT_WEBHOOK_SECRET_PREVIOUS: '',
      WEBHOOK_IP_ALLOWLIST: '',
      CHATWOOT_DEFAULT_TEAM_ID: '',
      ASSIGNMENT_RULES_JSON: '',
      ASSIGNMENT_STRATEGY: 'round_robin',
      CHATWOOT_AUTO_REPLY_ENABLED: 'false',
      CATALOG_URLS_JSON: '{}',
      WHATSAPP_FOLLOWUP_ENABLED: 'false',
      WHATSAPP_FOLLOWUP_TEMPLATE_NAME: '',
      WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE: 'es',
      WHATSAPP_FOLLOWUP_AFTER_HOURS: '24',
      META_PIXEL_ID: '',
      META_CAPI_ACCESS_TOKEN: '',
      META_CAPI_TEST_EVENT_CODE: '',
      META_GRAPH_BASE_URL: '',
      MAX_SYNC_ATTEMPTS: '5',
    },
    describe: {
      NODE_ENV: 'development | test | production',
      PORT: 'Puerto HTTP',
      LOG_LEVEL: 'Nivel de pino',
      DATABASE_URL: 'Postgres propio (crm_bridge)',
      RABBITMQ_URL: 'Usuario propio del servicio (C21): solo checkQueue, sin permiso configure',
      INTERNAL_API_TOKENS: 'Llamadores de /internal/*: JSON {"<llamador>":"<token>"} (C4)',
      SWAGGER_ENABLED: 'Swagger en producción (exige token igualmente)',
      SENTRY_DSN: 'Vacío = Sentry desactivado (C23)',
      SENTRY_ENVIRONMENT: 'Entorno de Sentry (por defecto NODE_ENV)',
      PII_ENCRYPTION_KEY: 'Clave AES-256-GCM (32 bytes en base64) para sync_jobs.payload (C8). Solo desarrollo',
      CHATWOOT_BASE_URL: 'URL base de Chatwoot (sin /api)',
      CHATWOOT_BASE_URL_ALLOWLIST: 'Hosts permitidos para CHATWOOT_BASE_URL (C20): host, host:puerto o *.dominio, separados por comas',
      CHATWOOT_ACCOUNT_ID: 'account_id de la cuenta en Chatwoot',
      CHATWOOT_INBOX_ID: 'Bandeja por defecto (si la sede no está en CHATWOOT_INBOX_ID_BY_CAMPUS)',
      CHATWOOT_INBOX_ID_BY_CAMPUS: 'Bandeja por sede (A4): JSON {"tacna":1,"arequipa":2}',
      CHATWOOT_API_ACCESS_TOKEN: 'Access Token de un agente/administrador de Chatwoot',
      CHATWOOT_WEBHOOK_SECRET: 'Secreto del ?token= y del HMAC del webhook',
      CHATWOOT_WEBHOOK_SECRET_PREVIOUS: 'Secreto anterior aceptado durante la rotación (C7); vacío = ninguno',
      WEBHOOK_IP_ALLOWLIST: 'IPs/CIDR (IPv4 e IPv6) permitidos para el webhook, separados por comas; vacío = sin filtro (C7)',
      CHATWOOT_DEFAULT_TEAM_ID: 'Equipo por defecto si ninguna regla coincide',
      ASSIGNMENT_RULES_JSON: 'Reglas de asignación (JSON, ver README)',
      ASSIGNMENT_STRATEGY: 'round_robin | least_loaded (A9)',
      CHATWOOT_AUTO_REPLY_ENABLED: 'Respuesta automática al vincular la conversación (A8)',
      CATALOG_URLS_JSON: 'Catálogo PDF por promoción: JSON {"<promotionId>":"https://..."}',
      WHATSAPP_FOLLOWUP_ENABLED: 'Seguimiento con plantilla aprobada si no escribió (A6)',
      WHATSAPP_FOLLOWUP_TEMPLATE_NAME: 'Nombre de la plantilla aprobada en Meta (categoría UTILITY)',
      WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE: 'Idioma de la plantilla (código de Meta, p. ej. es o es_PE)',
      WHATSAPP_FOLLOWUP_AFTER_HOURS: 'Horas tras la sincronización sin conversación antes de enviar la plantilla',
      META_PIXEL_ID: 'Pixel/dataset de Meta (A17); vacío = Conversions API desactivada',
      META_CAPI_ACCESS_TOKEN: 'Token de sistema para Conversions API; vacío = desactivada',
      META_CAPI_TEST_EVENT_CODE: 'Código de prueba del Administrador de eventos (solo pruebas)',
      META_GRAPH_BASE_URL: 'Base de la Graph API (por defecto https://graph.facebook.com/v21.0; solo cambiar en pruebas)',
      MAX_SYNC_ATTEMPTS: 'Intentos antes de DEAD y DLQ',
    },
  },
);

export type Env = EnvOf<typeof envDefinition>;
