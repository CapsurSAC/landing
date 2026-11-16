/**
 * Content-Security-Policy y cabeceras de seguridad (C1, C28). Funciones puras
 * para poder probarlas; las aplica `src/proxy.ts` en cada petición de página.
 */

export interface CspOptions {
  nonce: string;
  isDev: boolean;
  /** true solo si el sitio se sirve por HTTPS en producción. */
  upgradeInsecureRequests: boolean;
  /** Base absoluta de la API para el navegador (NEXT_PUBLIC_API_BASE_URL), si es de otro origen. */
  apiBaseUrl?: string;
  sentryDsn?: string;
  turnstileEnabled?: boolean;
}

export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.origin : null;
  } catch {
    return null;
  }
}

/** Nonce aleatorio de 128 bits en base64 (Web Crypto: válido en Node y Edge). */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function buildContentSecurityPolicy(options: CspOptions): string {
  const connect = new Set(["'self'"]);
  const api = originOf(options.apiBaseUrl);
  if (api) connect.add(api);
  const sentry = originOf(options.sentryDsn);
  if (sentry) connect.add(sentry);
  if (options.turnstileEnabled) connect.add(TURNSTILE_ORIGIN);

  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    ['script-src', ["'self'", `'nonce-${options.nonce}'`, "'strict-dynamic'", ...(options.isDev ? ["'unsafe-eval'"] : [])]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:']],
    ['font-src', ["'self'"]],
    ['connect-src', [...connect]],
    ['frame-src', [TURNSTILE_ORIGIN]],
    ['frame-ancestors', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'"]],
    ['object-src', ["'none'"]],
  ];
  const policy = directives.map(([name, values]) => `${name} ${values.join(' ')}`);
  if (options.upgradeInsecureRequests) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}

/** Cabeceras estáticas comunes a todas las respuestas (también se declaran en next.config.ts). */
export function staticSecurityHeaders(options: { hsts: boolean }): Array<{ key: string; value: string }> {
  return [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
    { key: 'X-DNS-Prefetch-Control', value: 'off' },
    ...(options.hsts ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }] : []),
  ];
}
