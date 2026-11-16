import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject, type SchemaObject } from '@nestjs/swagger';
import { ApiErrorSchema } from '@capsur/api-contracts';
import { z, type ZodType } from 'zod';
import { SERVICE_NAME, SERVICE_VERSION } from '../../version';

/** Esquema OpenAPI (3.0) aceptado por los decoradores `@ApiBody`/`@ApiResponse`. */
export type OpenApiSchema = SchemaObject;

/** Convierte un esquema Zod del contrato en un esquema OpenAPI 3.0 (B14). */
export function zodToOpenApi(schema: ZodType, io: 'input' | 'output' = 'output'): OpenApiSchema {
  const json = z.toJSONSchema(schema, { target: 'openapi-3.0', io, unrepresentable: 'any' }) as Record<string, unknown>;
  const { $schema: _ignored, ...rest } = json;
  return rest as SchemaObject;
}

/** Cuerpo problem-details común (`ApiErrorSchema` del contrato). */
export const ProblemDetailsOpenApi = zodToOpenApi(ApiErrorSchema);

/**
 * Documento OpenAPI a partir de los decoradores de los controladores, cuyos
 * cuerpos y respuestas se generan desde los esquemas Zod de
 * `@capsur/api-contracts`. Lo usan Swagger (`/internal/docs`) y el script
 * `openapi:export`.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle(SERVICE_NAME)
    .setDescription(
      'Registro transaccional de solicitudes de información (leads) de GRUPO CAPSUR: leads, estado, encuesta de ' +
        'origen, tracking, Libro de Reclamaciones y derechos ARCO (públicas, vía gateway) y administración, ' +
        'reportes y auditoría (/internal/*, con token de servicio; el gateway nunca las expone).',
    )
    .setVersion(SERVICE_VERSION)
    .addTag('leads', 'Registro y estado de solicitudes')
    .addTag('tracking', 'Eventos de embudo sin datos personales')
    .addTag('compliance', 'Libro de Reclamaciones y derechos ARCO')
    .addTag('admin', 'Panel de administración (token interno)')
    .addTag('reports', 'Embudo y reporte diario (token interno)')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}
