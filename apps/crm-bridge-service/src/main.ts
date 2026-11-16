import './instrument';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { bootstrapService, buildPinoOptions } from '@capsur/nest-kit';
import { Logger } from 'nestjs-pino';
import pino from 'pino';
import { AppModule } from './app.module';
import { assertChatwootUrlAllowed, isChatwootConfigured, loadAppEnv } from './config/env';
import { readServiceVersion, SERVICE_NAME } from './config/service-info';
import { buildOpenApiDocument } from './presentation/http/openapi';

async function bootstrap(): Promise<void> {
  const env = loadAppEnv();
  // C20: la URL de Chatwoot debe estar en la allowlist (https obligatorio en producción).
  assertChatwootUrlAllowed(env);
  const version = readServiceVersion();

  // rawBody: necesario para verificar la firma HMAC del webhook sobre el cuerpo crudo.
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(env), { rawBody: true, bufferLogs: true });
  const listen = bootstrapService(app, {
    service: SERVICE_NAME,
    version,
    corsOrigins: [],
    contentTypeExemptPrefixes: ['/webhooks/'],
    swaggerEnabled: env.SWAGGER_ENABLED,
    nodeEnv: env.NODE_ENV,
    internalTokensJson: env.INTERNAL_API_TOKENS,
    swagger: {
      title: SERVICE_NAME,
      description: 'Puente asíncrono entre la plataforma de captación CAPSUR y Chatwoot',
      document: () => buildOpenApiDocument(version),
    },
  });

  const logger = app.get(Logger);
  if (!isChatwootConfigured(env)) {
    logger.warn(
      'Chatwoot NO está configurado (CHATWOOT_BASE_URL o CHATWOOT_API_ACCESS_TOKEN con valores de ejemplo): los leads se reintentarán hasta agotar intentos',
    );
  }
  if (env.NODE_ENV === 'production' && env.CHATWOOT_WEBHOOK_SECRET === 'change-me') {
    logger.error('CHATWOOT_WEBHOOK_SECRET sigue con el valor de ejemplo en producción');
  }

  await listen(env.PORT);
}

bootstrap().catch((error: unknown) => {
  // Antes de tener la app no hay logger de Nest: pino síncrono con la misma redacción (C26).
  // El mensaje de EnvValidationError lista variables sin valores; nunca se imprime el error crudo.
  const fatal = pino(buildPinoOptions({ service: SERVICE_NAME }), pino.destination({ sync: true }));
  fatal.fatal(
    { err: error instanceof Error ? { type: error.name, message: error.message } : { type: typeof error } },
    `No se pudo arrancar ${SERVICE_NAME}`,
  );
  process.exit(1);
});
