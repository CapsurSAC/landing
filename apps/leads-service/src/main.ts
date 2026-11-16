import './instrument';
import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { bootstrapService } from '@capsur/nest-kit';
import { AppModule } from './app.module';
import { loadServiceEnv } from './config/env';
import { buildOpenApiDocument } from './presentation/http/openapi';
import { SERVICE_NAME, SERVICE_VERSION } from './version';

async function bootstrap(): Promise<void> {
  const env = loadServiceEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(env), { bufferLogs: true });
  const listen = bootstrapService(app, {
    service: SERVICE_NAME,
    version: SERVICE_VERSION,
    corsOrigins: env.CORS_ORIGINS,
    nodeEnv: env.NODE_ENV,
    swaggerEnabled: env.SWAGGER_ENABLED,
    internalTokensJson: env.INTERNAL_API_TOKENS,
    swagger: {
      title: SERVICE_NAME,
      description: 'Leads de GRUPO CAPSUR',
      document: (application) => buildOpenApiDocument(application),
    },
  });
  await listen(env.PORT);
}

bootstrap().catch((error: unknown) => {
  // Antes de que exista el logger de la app: Logger de Nest (sin console, C26).
  // EnvValidationError lista las variables inválidas sin mostrar sus valores.
  new Logger('Bootstrap').error(
    error instanceof Error ? error.message : 'Error desconocido',
    error instanceof Error ? error.stack : undefined,
  );
  process.exit(1);
});
