import { Logger } from '@nestjs/common';
import type { Env } from '../../src/config/env';
import { envDefinition } from '../../src/config/env.definition';

/**
 * Entorno de pruebas. Se carga antes de cada archivo de pruebas: nada lee
 * `process.env` salvo `testEnv()`, que valida con la misma definición que
 * producción.
 */
process.env.NODE_ENV = 'test';

// Las clases del kit usan `new Logger(...)`; en pruebas no deben ensuciar la salida.
Logger.overrideLogger(false);

export const TEST_ENV_SOURCE: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  PORT: '3999',
  DATABASE_URL: 'postgresql://leads:leads@localhost:5432/leads_test?schema=public',
  RABBITMQ_URL: 'amqp://leads_svc:leads_svc_local@localhost:5672',
  INTERNAL_API_TOKENS: '{"admin-web":"test-admin-token-0123456789"}',
  CORS_ORIGINS: 'http://localhost:3000',
  PII_ENCRYPTION_KEY: 'ZGV2LW9ubHktcGlpLWtleS0zMi1ieXRlcy1sb25nISE=',
  PII_HASH_KEY: 'ZGV2LW9ubHktaGFzaC1rZXktMzItYnl0ZXMtbG9uZyEhIQ==',
  LEAD_TOKEN_SECRET: 'test-only-lead-token-secret-0123',
  PROMOTIONS_SERVICE_URL: 'http://localhost:3001',
  PROMOTIONS_SERVICE_TOKEN: 'test-leads-to-promotions',
  WHATSAPP_NUMBER: '51987654321',
  BRAND_DISPLAY_NAME: 'Sistemas del Sur',
  REFERENCE_PREFIX: 'SIS',
  OUTBOX_POLL_INTERVAL_MS: '60000',
  LEADS_RATE_LIMIT_PER_MINUTE: '1000',
  LEADS_PHONE_RATE_LIMIT_PER_HOUR: '5',
  COMPLIANCE_RATE_LIMIT_PER_HOUR: '5',
  IP_HASH_PEPPER: 'pimienta-de-pruebas-0123456789',
  PERU_HOLIDAYS: '2026-12-08,2026-12-25',
};

export const ADMIN_TOKEN = 'test-admin-token-0123456789';

/** Entorno validado para pruebas, con sobrescrituras opcionales. */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return envDefinition.parse({ ...TEST_ENV_SOURCE, ...overrides });
}
