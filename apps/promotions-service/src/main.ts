import './instrument';
import { bootstrapService } from '@capsur/nest-kit';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { type Env } from './config/env';
import { buildOpenApiDocument } from './presentation/http/openapi';
import { SERVICE_NAME, SERVICE_VERSION } from './service-info';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  // helmet, CORS, trust proxy, JSON ≤ 100 kb, 415, problem-details, shutdown
  // hooks y Swagger condicionado (solo fuera de producción o con token).
  const listen = bootstrapService(app, {
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    corsOrigins: config.get('CORS_ORIGINS', { infer: true }),
    nodeEnv: config.get('NODE_ENV', { infer: true }),
    swaggerEnabled: config.get('SWAGGER_ENABLED', { infer: true }),
    internalTokensJson: JSON.stringify(config.get('INTERNAL_API_TOKENS', { infer: true })),
    swagger: {
      title: SERVICE_NAME,
      description: 'Catálogo comercial de GRUPO CAPSUR: autoridad sobre precios y vigencias.',
      document: buildOpenApiDocument,
    },
  });

  await listen(config.get('PORT', { infer: true }));
}

bootstrap().catch((error: unknown) => {
  // Sin logger disponible aún: se escribe directo a stderr (la regla no-console lo exige).
  process.stderr.write(`No se pudo arrancar ${SERVICE_NAME}: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
  process.exit(1);
});
