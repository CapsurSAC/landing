import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defineEnv, EnvValidationError, loadEnv, type EnvOf } from './define-env';
import { renderEnvExample } from './env-example';
import {
  base64Key32Schema,
  corsOriginsSchema,
  databaseUrlSchema,
  internalTokensSchema,
  nodeEnvSchema,
  portSchema,
  redisUrlSchema,
} from './fragments';

const definition = defineEnv(
  {
    NODE_ENV: nodeEnvSchema,
    PORT: portSchema.default(3002),
    DATABASE_URL: databaseUrlSchema,
    REDIS_URL: redisUrlSchema,
    INTERNAL_API_TOKENS: internalTokensSchema,
    CORS_ORIGINS: corsOriginsSchema,
    PII_ENCRYPTION_KEY: base64Key32Schema.describe('Clave AES-256 (32 bytes en base64)'),
  },
  {
    examples: {
      NODE_ENV: 'development',
      PORT: '3002',
      DATABASE_URL: 'postgresql://leads:leads@localhost:5432/leads',
      REDIS_URL: 'redis://localhost:6379',
      INTERNAL_API_TOKENS: '{"admin-web":"dev-admin-to-leads"}',
      CORS_ORIGINS: 'http://localhost:3000',
      PII_ENCRYPTION_KEY: 'ZGV2LW9ubHktcGlpLWtleS0zMi1ieXRlcy1sb25nISE=',
    },
  },
);

describe('defineEnv / loadEnv', () => {
  it('los ejemplos forman un entorno válido y tipado', () => {
    const env: EnvOf<typeof definition> = loadEnv(definition, { ...definition.examples, UNRELATED: 'x' });
    assert.equal(env.PORT, 3002);
    assert.equal(env.NODE_ENV, 'development');
    assert.deepEqual(env.INTERNAL_API_TOKENS, { 'admin-web': 'dev-admin-to-leads' });
    assert.deepEqual(env.CORS_ORIGINS, ['http://localhost:3000']);
    assert.equal('UNRELATED' in env, false);
  });

  it('lista cada variable inválida sin mostrar sus valores', () => {
    const secret = 'super-secreto-que-no-debe-aparecer';
    let caught: unknown;
    try {
      loadEnv(definition, {
        NODE_ENV: 'production',
        PORT: 'abc',
        DATABASE_URL: `mysql://root:${secret}@db/x`,
        INTERNAL_API_TOKENS: '{"admin-web":"corto"}',
        PII_ENCRYPTION_KEY: secret,
      });
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof EnvValidationError);
    const variables = caught.issues.map((issue) => issue.variable);
    assert.deepEqual(variables, ['DATABASE_URL', 'INTERNAL_API_TOKENS', 'PII_ENCRYPTION_KEY', 'PORT']);
    assert.match(caught.message, /Configuración inválida: 4 variable\(s\)/);
    assert.match(caught.message, /- INTERNAL_API_TOKENS: En producción el token de "admin-web"/);
    assert.equal(caught.message.includes(secret), false);
  });

  it('indica las variables obligatorias no definidas', () => {
    assert.throws(
      () => loadEnv(definition, {}),
      (error: unknown) =>
        error instanceof EnvValidationError &&
        /- DATABASE_URL: no está definida/.test(error.message) &&
        /- INTERNAL_API_TOKENS: no está definida/.test(error.message),
    );
  });

  it('renderEnvExample incluye cada variable y las descripciones', () => {
    const content = renderEnvExample(definition, 'dist/config/env.js#definition');
    assert.match(content, /^# Generado por capsur-env-example desde dist\/config\/env\.js#definition/);
    assert.match(content, /# Clave AES-256 \(32 bytes en base64\)\nPII_ENCRYPTION_KEY=ZGV2/);
    assert.match(content, /\nINTERNAL_API_TOKENS=\{"admin-web":"dev-admin-to-leads"\}\n/);
    assert.equal(content.endsWith('\n'), true);
  });
});
