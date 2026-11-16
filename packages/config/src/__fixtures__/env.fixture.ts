import { z } from 'zod';
import { defineEnv } from '../define-env';
import { booleanFlagSchema, databaseUrlSchema, internalTokensSchema, nodeEnvSchema, portSchema } from '../fragments';

/** Definición de ejemplo usada por las pruebas del CLI. */
export const envDefinition = defineEnv(
  {
    NODE_ENV: nodeEnvSchema,
    PORT: portSchema.default(3002).describe('Puerto HTTP del servicio'),
    DATABASE_URL: databaseUrlSchema,
    INTERNAL_API_TOKENS: internalTokensSchema,
    SWAGGER_ENABLED: booleanFlagSchema.default(false),
    GREETING: z.string().default('hola mundo'),
  },
  {
    title: 'leads-service',
    examples: {
      NODE_ENV: 'development',
      PORT: '3002',
      DATABASE_URL: 'postgresql://leads:leads@localhost:5432/leads',
      INTERNAL_API_TOKENS: '{"admin-web":"dev-admin-to-leads"}',
      SWAGGER_ENABLED: 'false',
      GREETING: 'hola mundo # con almohadilla',
    },
    describe: {
      INTERNAL_API_TOKENS: 'Tokens de los llamadores internos: JSON {"<llamador>":"<token>"}',
    },
  },
);

export const notADefinition = { foo: 'bar' };
