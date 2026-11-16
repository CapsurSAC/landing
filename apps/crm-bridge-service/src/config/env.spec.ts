import { EnvValidationError } from '@capsur/config';
import { UrlNotAllowedError } from '@capsur/nest-kit';
import { scrubWebhookToken } from '../infrastructure/logging/logger-params';
import { assertChatwootUrlAllowed, inboxResolver, isFollowupEnabled, isMetaCapiEnabled, loadAppEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://crm_bridge:crm_bridge@localhost:5432/crm_bridge',
  RABBITMQ_URL: 'amqp://crm_bridge_svc:crm_bridge_svc_local@localhost:5672',
  INTERNAL_API_TOKENS: '{"admin-web":"dev-admin-to-crm","ops":"dev-ops-to-crm"}',
  PII_ENCRYPTION_KEY: 'ZGV2LW9ubHktcGlpLWtleS0zMi1ieXRlcy1sb25nISE=',
  CHATWOOT_BASE_URL: 'https://chatwoot.example.com',
  CHATWOOT_BASE_URL_ALLOWLIST: 'chatwoot.example.com',
  CHATWOOT_ACCOUNT_ID: '1',
  CHATWOOT_INBOX_ID: '5',
  CHATWOOT_API_ACCESS_TOKEN: 'change-me',
  CHATWOOT_WEBHOOK_SECRET: 'change-me',
};

describe('entorno de crm-bridge-service', () => {
  it('aplica los valores por defecto de la especificación', () => {
    const env = loadAppEnv(base);
    expect(env).toMatchObject({
      PORT: 3003,
      INTERNAL_API_TOKENS: { 'admin-web': 'dev-admin-to-crm', ops: 'dev-ops-to-crm' },
      ASSIGNMENT_STRATEGY: 'round_robin',
      CHATWOOT_AUTO_REPLY_ENABLED: false,
      CATALOG_URLS_JSON: {},
      WEBHOOK_IP_ALLOWLIST: [],
      WHATSAPP_FOLLOWUP_TEMPLATE_LANGUAGE: 'es',
      WHATSAPP_FOLLOWUP_AFTER_HOURS: 24,
      MAX_SYNC_ATTEMPTS: 5,
      META_GRAPH_BASE_URL: 'https://graph.facebook.com/v21.0',
    });
    expect(isMetaCapiEnabled(env)).toBe(false);
    expect(isFollowupEnabled(env)).toBe(false);
  });

  it('bandeja por sede con respaldo en CHATWOOT_INBOX_ID (A4)', () => {
    const env = loadAppEnv({ ...base, CHATWOOT_INBOX_ID_BY_CAMPUS: '{"tacna":1,"arequipa":2}' });
    const inboxFor = inboxResolver(env);
    expect(inboxFor('tacna')).toBe(1);
    expect(inboxFor('arequipa')).toBe(2);
    expect(inboxResolver(loadAppEnv(base))('arequipa')).toBe(5);
  });

  it('rechaza valores inválidos sin mostrarlos', () => {
    const attempt = (): unknown =>
      loadAppEnv({
        ...base,
        WEBHOOK_IP_ALLOWLIST: '10.0.0.0/8,host.malo',
        CHATWOOT_INBOX_ID_BY_CAMPUS: '{"lima":3}',
        ASSIGNMENT_RULES_JSON: '[{"teamId":"x"}]',
        INTERNAL_API_TOKEN: 'obsoleta',
      });
    expect(attempt).toThrow(EnvValidationError);
    try {
      attempt();
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('WEBHOOK_IP_ALLOWLIST');
      expect(message).toContain('CHATWOOT_INBOX_ID_BY_CAMPUS');
      expect(message).toContain('ASSIGNMENT_RULES_JSON');
      expect(message).not.toContain('host.malo');
    }
  });

  it('C20: CHATWOOT_BASE_URL debe estar en la allowlist y ser https en producción', () => {
    expect(() => assertChatwootUrlAllowed(loadAppEnv(base))).not.toThrow();
    expect(() => assertChatwootUrlAllowed(loadAppEnv({ ...base, CHATWOOT_BASE_URL: 'https://evil.example.net' }))).toThrow(UrlNotAllowedError);
    expect(() => assertChatwootUrlAllowed(loadAppEnv({ ...base, CHATWOOT_BASE_URL_ALLOWLIST: '' }))).toThrow(UrlNotAllowedError);
    const production = loadAppEnv({
      ...base,
      NODE_ENV: 'production',
      INTERNAL_API_TOKENS: '{"ops":"un-token-largo-de-produccion"}',
      CHATWOOT_BASE_URL: 'http://chatwoot.example.com',
    });
    expect(() => assertChatwootUrlAllowed(production)).toThrow(/https/);
  });

  it('el token del webhook no aparece en la URL registrada por pino', () => {
    expect(scrubWebhookToken('/webhooks/chatwoot?token=secreto&x=1')).toBe('/webhooks/chatwoot?token=[REDACTED]&x=1');
    expect(scrubWebhookToken('/webhooks/chatwoot?a=1&token=secreto')).toBe('/webhooks/chatwoot?a=1&token=[REDACTED]');
    expect(scrubWebhookToken('/internal/health')).toBe('/internal/health');
  });
});
