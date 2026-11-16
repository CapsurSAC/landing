import { ApiErrorSchema, HealthSchema, IntegrationSummarySchema } from '@capsur/api-contracts';
import { type OpenAPIObject } from '@nestjs/swagger';
import { z } from 'zod';
import {
  AuditListResponseSchema,
  AuditQuerySchema,
  JobsQuerySchema,
  JobsResponseSchema,
  RetryRequestSchema,
  RetryResultSchema,
  WebhookAcceptedSchema,
} from './schemas';

type JsonSchema = Record<string, unknown>;

/**
 * OpenAPI 3.1 del servicio generado desde los esquemas Zod (B14), sin Nest, base de datos ni
 * broker: lo usan Swagger (`/internal/docs`) y `pnpm openapi:export`.
 */
function schemaOf(schema: z.ZodType, io: 'input' | 'output' = 'output'): JsonSchema {
  const json = z.toJSONSchema(schema, { io, unrepresentable: 'any', target: 'draft-2020-12' }) as JsonSchema;
  const { $schema: _ignored, ...rest } = json;
  return rest;
}

function queryParameters(schema: z.ZodObject): Array<Record<string, unknown>> {
  const json = schemaOf(schema, 'input');
  const properties = (json.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set(Array.isArray(json.required) ? (json.required as string[]) : []);
  return Object.entries(properties).map(([name, property]) => ({
    name,
    in: 'query',
    required: required.has(name),
    schema: property,
  }));
}

const problem = (description: string): Record<string, unknown> => ({
  description,
  content: { 'application/problem+json': { schema: { $ref: '#/components/schemas/ApiError' } } },
});

const json = (description: string, ref: string): Record<string, unknown> => ({
  description,
  content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } },
});

const INTERNAL_ERRORS = {
  '401': problem('Token de servicio ausente o inválido (UNAUTHORIZED)'),
  '500': problem('Error interno'),
};

const ACTOR_PARAMETER = {
  name: 'x-actor',
  in: 'header',
  required: false,
  description: 'Correo de la persona del panel (auditoría)',
  schema: { type: 'string', maxLength: 254 },
};

export function buildOpenApiDocument(version: string): OpenAPIObject {
  const document = {
    openapi: '3.1.0',
    info: {
      title: 'crm-bridge-service',
      version,
      description:
        'Puente asíncrono entre la plataforma de captación de GRUPO CAPSUR y Chatwoot. Las rutas `/internal/*` exigen ' +
        '`Authorization: Bearer <token>` de `INTERNAL_API_TOKENS` (excepto `/internal/health`). Generado desde Zod.',
    },
    servers: [{ url: 'http://localhost:3003', description: 'Desarrollo' }],
    tags: [
      { name: 'webhooks', description: 'Entradas desde Chatwoot' },
      { name: 'internal', description: 'Operación (red privada)' },
    ],
    paths: {
      '/webhooks/chatwoot': {
        post: {
          tags: ['webhooks'],
          operationId: 'receiveChatwootWebhook',
          summary: 'Webhook de Chatwoot',
          security: [],
          description:
            'Allowlist de IP (`WEBHOOK_IP_ALLOWLIST`, 403) y autenticación por `?token=` o cabecera `x-chatwoot-signature` ' +
            '(HMAC-SHA256 hex del cuerpo crudo) con `CHATWOOT_WEBHOOK_SECRET` o, durante la rotación, ' +
            '`CHATWOOT_WEBHOOK_SECRET_PREVIOUS` (401). Siempre 202 si se acepta.',
          parameters: [
            { name: 'token', in: 'query', required: false, schema: { type: 'string' } },
            { name: 'x-chatwoot-signature', in: 'header', required: false, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', additionalProperties: true } } },
          },
          responses: {
            '202': json('Aceptado; `outcome` indica el resultado', 'WebhookAccepted'),
            '401': problem('Token o firma inválidos (INVALID_WEBHOOK_AUTH)'),
            '403': problem('IP no permitida (WEBHOOK_IP_FORBIDDEN)'),
          },
        },
      },
      '/internal/health': {
        get: {
          tags: ['internal'],
          operationId: 'health',
          summary: 'Salud del servicio (database crítica; rabbitmq y chatwoot no críticas)',
          security: [],
          responses: {
            '200': json('ok o degraded', 'Health'),
            '503': json('down (base de datos caída)', 'Health'),
          },
        },
      },
      '/internal/integrations/retry': {
        post: {
          tags: ['internal'],
          operationId: 'retryIntegrations',
          summary: 'Reprocesa trabajos FAILED/DEAD con el payload almacenado (auditado)',
          parameters: [ACTOR_PARAMETER],
          requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RetryRequest' } } } },
          responses: {
            '200': json('Resultado del reproceso', 'RetryResult'),
            '400': problem('Validación fallida (VALIDATION_FAILED)'),
            ...INTERNAL_ERRORS,
          },
        },
      },
      '/internal/integrations/jobs': {
        get: {
          tags: ['internal'],
          operationId: 'listIntegrationJobs',
          summary: 'Trabajos de sincronización (sin datos personales)',
          parameters: queryParameters(JobsQuerySchema),
          responses: { '200': json('Trabajos', 'JobsResponse'), '400': problem('Validación fallida'), ...INTERNAL_ERRORS },
        },
      },
      '/internal/integrations/summary': {
        get: {
          tags: ['internal'],
          operationId: 'integrationSummary',
          summary: 'Conteos por estado, colas (checkQueue), último sync y si Chatwoot está configurado',
          responses: { '200': json('Resumen', 'IntegrationSummary'), ...INTERNAL_ERRORS },
        },
      },
      '/internal/admin/audit': {
        get: {
          tags: ['internal'],
          operationId: 'listAudit',
          summary: 'Últimas acciones internas auditadas',
          parameters: queryParameters(AuditQuerySchema),
          responses: { '200': json('Entradas de auditoría', 'AuditList'), '400': problem('Validación fallida'), ...INTERNAL_ERRORS },
        },
      },
    },
    components: {
      securitySchemes: { bearer: { type: 'http', scheme: 'bearer' } },
      schemas: {
        ApiError: schemaOf(ApiErrorSchema),
        Health: schemaOf(HealthSchema),
        WebhookAccepted: schemaOf(WebhookAcceptedSchema),
        RetryRequest: schemaOf(RetryRequestSchema, 'input'),
        RetryResult: schemaOf(RetryResultSchema),
        JobsResponse: schemaOf(JobsResponseSchema),
        IntegrationSummary: schemaOf(IntegrationSummarySchema),
        AuditList: schemaOf(AuditListResponseSchema),
      },
    },
    security: [{ bearer: [] }],
  };
  return document as unknown as OpenAPIObject;
}
