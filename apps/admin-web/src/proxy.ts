import { NextResponse, type NextRequest } from 'next/server';
import { buildCsp } from './lib/csp';
import { isSecureCookieEnv, SessionConfigError, sessionCookieName, verifySession } from './lib/session';

/**
 * Proxy de Next 16 (antes «middleware»): se ejecuta antes de cada ruta.
 *  1. Genera un nonce y aplica la CSP estricta (Next lo inyecta en sus scripts).
 *  2. Sin sesión válida → redirección a /login (las páginas y acciones vuelven
 *     a comprobar sesión y rol en el servidor: esto es solo la primera barrera).
 */

const PUBLIC_PATHS = new Set(['/login', '/robots.txt', '/api/health']);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const https = request.nextUrl.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
  const csp = buildCsp(nonce, { dev: process.env.NODE_ENV === 'development', https });

  let session = null;
  try {
    const token = request.cookies.get(sessionCookieName(isSecureCookieEnv(process.env)))?.value;
    session = await verifySession(token, process.env.ADMIN_SESSION_SECRET);
  } catch (err) {
    if (err instanceof SessionConfigError) {
      return new NextResponse(`Configuración incompleta del panel: ${err.message}`, {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
      });
    }
    throw err;
  }

  const isPublic = PUBLIC_PATHS.has(pathname);
  if (!session && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    if (pathname !== '/') url.searchParams.set('next', `${pathname}${search}`);
    return withSecurityHeaders(NextResponse.redirect(url), csp);
  }
  if (session && pathname === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return withSecurityHeaders(NextResponse.redirect(url), csp);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', csp);
  return withSecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), csp);
}

function withSecurityHeaders(response: NextResponse, csp: string): NextResponse {
  response.headers.set('content-security-policy', csp);
  response.headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  response.headers.set('referrer-policy', 'no-referrer');
  response.headers.set('cross-origin-opener-policy', 'same-origin');
  response.headers.set('cross-origin-resource-policy', 'same-origin');
  response.headers.set('x-frame-options', 'DENY');
  response.headers.set('x-content-type-options', 'nosniff');
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|icon.svg).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
