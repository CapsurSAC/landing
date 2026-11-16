/**
 * Content-Security-Policy estricta con nonce por petición (C1). Sin orígenes
 * externos: el panel no carga nada de terceros. En desarrollo React necesita
 * `unsafe-eval` y el HMR inserta estilos y abre un WebSocket.
 */
export function buildCsp(nonce: string, options: { dev: boolean; https: boolean }): string {
  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${options.dev ? ` 'unsafe-eval'` : ''}`,
    options.dev ? `style-src 'self' 'unsafe-inline'` : `style-src 'self' 'nonce-${nonce}'`,
    `img-src 'self' data: blob:`,
    `font-src 'self'`,
    options.dev ? `connect-src 'self' ws: wss:` : `connect-src 'self'`,
    `object-src 'none'`,
    `base-uri 'none'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `frame-src 'none'`,
    `worker-src 'self'`,
    `manifest-src 'self'`,
  ];
  if (options.https) directives.push('upgrade-insecure-requests');
  return directives.join('; ');
}

/** Solo rutas relativas del propio panel (evita redirecciones abiertas tras el login). */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null;
  if (/[\r\n]/.test(value) || value.startsWith('/login')) return null;
  return value;
}
