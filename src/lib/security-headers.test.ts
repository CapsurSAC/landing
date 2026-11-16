import { describe, expect, test } from 'vitest';
import { buildContentSecurityPolicy, createNonce, staticSecurityHeaders } from './security-headers';

describe('CSP (C1)', () => {
  test('producción: nonce, strict-dynamic, sin unsafe-eval y con upgrade-insecure-requests', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'abc123', isDev: false, upgradeInsecureRequests: true });
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("font-src 'self'");
    expect(csp).toContain('frame-src https://challenges.cloudflare.com');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp.endsWith('upgrade-insecure-requests')).toBe(true);
  });

  test('desarrollo: unsafe-eval y sin upgrade-insecure-requests', () => {
    const csp = buildContentSecurityPolicy({ nonce: 'n', isDev: true, upgradeInsecureRequests: false });
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain('upgrade-insecure-requests');
  });

  test('connect-src añade API externa, Sentry y Turnstile solo si están configurados', () => {
    const base = buildContentSecurityPolicy({ nonce: 'n', isDev: false, upgradeInsecureRequests: false });
    expect(base).toContain("connect-src 'self';");
    const full = buildContentSecurityPolicy({
      nonce: 'n',
      isDev: false,
      upgradeInsecureRequests: false,
      apiBaseUrl: 'https://api.sis.example.com/base',
      sentryDsn: 'https://key@o123.ingest.sentry.io/456',
      turnstileEnabled: true,
    });
    expect(full).toContain(
      "connect-src 'self' https://api.sis.example.com https://o123.ingest.sentry.io https://challenges.cloudflare.com;",
    );
  });

  test('el nonce es aleatorio y en base64', () => {
    const a = createNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
    expect(createNonce()).not.toBe(a);
  });

  test('cabeceras estáticas (C28) con HSTS solo cuando se pide', () => {
    const keys = staticSecurityHeaders({ hsts: false }).map((h) => h.key);
    expect(keys).toEqual(
      expect.arrayContaining(['Cross-Origin-Opener-Policy', 'Cross-Origin-Resource-Policy', 'X-DNS-Prefetch-Control', 'Permissions-Policy']),
    );
    expect(keys).not.toContain('Strict-Transport-Security');
    expect(staticSecurityHeaders({ hsts: true }).map((h) => h.key)).toContain('Strict-Transport-Security');
  });
});
