import { type INestApplication } from '@nestjs/common';
import { type ApiResponseSchemaHost, DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { ApiErrorSchema } from '@capsur/api-contracts';
import { z, type ZodType } from 'zod';
import { SERVICE_NAME, SERVICE_VERSION } from '../../service-info';

/** Esquema OpenAPI tal como lo aceptan los decoradores `@ApiXxxResponse`. */
export type SchemaObject = ApiResponseSchemaHost['schema'];

/** Convierte un esquema Zod del contrato en un esquema OpenAPI 3.0. */
export function openApiSchema(schema: ZodType): SchemaObject {
  const json = z.toJSONSchema(schema, { target: 'openapi-3.0', unrepresentable: 'any', io: 'input' });
  const { $schema: _ignored, ...rest } = json;
  return rest as SchemaObject;
}

export const PROBLEM_DETAILS_SCHEMA = openApiSchema(ApiErrorSchema);

/**
 * Documento OpenAPI del servicio a partir de los decoradores de los
 * controladores (cuyos esquemas salen de los contratos Zod). Lo usan Swagger
 * (`/internal/docs`) y `openapi:export` (B14).
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle(SERVICE_NAME)
    .setDescription(
      'Catálogo comercial de GRUPO CAPSUR: marcas, especialidades, campañas y promociones. ' +
        'Autoridad sobre precios y vigencias. Las rutas /internal/* no se exponen por el gateway ' +
        'y exigen `Authorization: Bearer <token>` salvo /internal/health.',
    )
    .setVersion(SERVICE_VERSION)
    .addTag('Catálogo público', 'Expuesto por el gateway bajo /api/v1')
    .addTag('Interno', 'Solo red de servicios (leads-service)')
    .addTag('Administración', 'Panel admin-web; cada acción queda auditada')
    .addBearerAuth({ type: 'http', scheme: 'bearer', description: 'Token de servicio (INTERNAL_API_TOKENS)' })
    .build();
  return SwaggerModule.createDocument(app, config);
}
