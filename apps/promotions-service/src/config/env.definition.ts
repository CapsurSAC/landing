import {
  booleanFlagSchema,
  corsOriginsSchema,
  databaseUrlSchema,
  defineEnv,
  type EnvOf,
  internalTokensSchema,
  logLevelSchema,
  nodeEnvSchema,
  optionalStringSchema,
  portSchema,
  redisUrlSchema,
  sentryDsnSchema,
} from '@capsur/config';
import { z } from 'zod';

/**
 * Variables de entorno de promotions-service (B25). Este módulo no tiene
 * efectos al importarse: lo leen el arranque y el CLI `capsur-env-example`
 * que regenera `.env.example` (`pnpm env:example`).
 */
export const envDefinition = defineEnv(
  {
    NODE_ENV: nodeEnvSchema,
    PORT: portSchema.default(3001),
    LOG_LEVEL: logLevelSchema,
    DATABASE_URL: databaseUrlSchema,
    REDIS_URL: redisUrlSchema,
    CATALOG_CACHE_TTL_SECONDS: z.coerce.number().int().nonnegative().default(60),
    CORS_ORIGINS: corsOriginsSchema,
    INTERNAL_API_TOKENS: internalTokensSchema,
    SWAGGER_ENABLED: booleanFlagSchema.default(false),
    SENTRY_DSN: sentryDsnSchema,
    WEB_REVALIDATE_URL: z.preprocess(
      (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
      z.url().optional(),
    ),
    WEB_REVALIDATE_SECRET: optionalStringSchema,
  },
  {
    title: 'promotions-service: variables de entorno (desarrollo)',
    examples: {
      NODE_ENV: 'development',
      PORT: '3001',
      LOG_LEVEL: 'debug',
      DATABASE_URL: 'postgresql://promotions:promotions@localhost:5432/promotions?schema=public',
      REDIS_URL: 'redis://localhost:6379',
      CATALOG_CACHE_TTL_SECONDS: '60',
      CORS_ORIGINS: 'http://localhost:3000',
      INTERNAL_API_TOKENS: '{"admin-web":"dev-admin-to-promotions","leads-service":"dev-leads-to-promotions"}',
      SWAGGER_ENABLED: 'false',
      SENTRY_DSN: '',
      WEB_REVALIDATE_URL: 'http://localhost:3000/api/revalidate',
      WEB_REVALIDATE_SECRET: 'dev-revalidate-secret',
    },
    describe: {
      CATALOG_CACHE_TTL_SECONDS: 'Segundos de caché en Redis de las respuestas públicas del catálogo',
      INTERNAL_API_TOKENS: 'Llamadores internos permitidos: JSON {"<llamador>":"<token>"}',
      SWAGGER_ENABLED: 'Swagger en producción (además exige token interno)',
      SENTRY_DSN: 'Vacío = Sentry desactivado',
      WEB_REVALIDATE_URL: 'Endpoint de la landing que invalida la caché del catálogo tras un cambio (B8)',
      WEB_REVALIDATE_SECRET: 'Secreto compartido con la landing (cabecera x-revalidate-secret)',
    },
  },
);

export type Env = EnvOf<typeof envDefinition>;
