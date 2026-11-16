import { NextResponse, type NextRequest } from 'next/server';
import { buildContentSecurityPolicy, createNonce, staticSecurityHeaders } from '@/lib/security-headers';

/**
 * Proxy de Next 16 (antes «middleware»). Genera un nonce por petición y fija
 * la CSP estricta (C1). Next lee el nonce de la cabecera Content-Security-Policy
 * de la PETICIÓN y lo aplica a sus propios scripts; los componentes lo leen
 * de `x-nonce` (JSON-LD, script del experimento, Turnstile).
 */
export function proxy(request: NextRequest) {
  const isDev = process.env.NODE_ENV === 'development';
  const isHttpsProduction = !isDev && (process.env.NEXT_PUBLIC_SITE_URL ?? '').startsWith('https://');
  const nonce = createNonce();
  const csp = buildContentSecurityPolicy({
    nonce,
    isDev,
    upgradeInsecureRequests: isHttpsProduction,
    apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL,
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    turnstileEnabled: Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  for (const { key, value } of staticSecurityHeaders({ hsts: isHttpsProduction })) response.headers.set(key, value);
  return response;
}

export const config = {
  matcher: [
    {
      // Páginas y metadatos dinámicos; se excluyen la API, los estáticos y las prefetch de next/link.
      source: '/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|brand/|hero/|about/|og.png).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
