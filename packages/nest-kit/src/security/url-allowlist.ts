/** La URL no cumple la allowlist o el esquema exigido. */
export class UrlNotAllowedError extends Error {
  readonly code = 'URL_NOT_ALLOWED';
  constructor(message: string) {
    super(message);
    this.name = 'UrlNotAllowedError';
  }
}

/** Opciones de {@link assertAllowedUrl}. */
export interface AllowedUrlOptions {
  /** Exige `https:` (recomendado en producción). Por defecto `false`. */
  requireHttps?: boolean;
}

/** Normaliza la allowlist: CSV o lista → entradas en minúsculas sin vacíos. */
export function parseAllowlist(allowlist: string | readonly string[]): string[] {
  const items = typeof allowlist === 'string' ? allowlist.split(',') : [...allowlist];
  return items.map((item) => item.trim().toLowerCase()).filter((item) => item !== '');
}

function matchesEntry(entry: string, hostname: string, host: string): boolean {
  if (entry.startsWith('*.')) {
    const suffix = entry.slice(1); // ".example.com"
    return hostname.endsWith(suffix) && hostname.length > suffix.length;
  }
  // Entrada con puerto (`host:8080`) se compara con host:puerto; si no, solo el nombre.
  return entry.includes(':') && !entry.startsWith('[') ? entry === host : entry === hostname;
}

/**
 * Valida una URL de configuración contra una allowlist de hosts (C20) para
 * evitar SSRF por configuración errónea. Entradas: `host`, `host:puerto` o
 * `*.dominio` (solo subdominios). Una allowlist vacía no permite nada.
 * Rechaza esquemas distintos de http/https y URLs con credenciales.
 * Devuelve la URL parseada.
 *
 * @example
 * assertAllowedUrl(env.CHATWOOT_BASE_URL, env.CHATWOOT_BASE_URL_ALLOWLIST, { requireHttps: env.NODE_ENV === 'production' })
 */
export function assertAllowedUrl(url: string, allowlistCsv: string | readonly string[], options: AllowedUrlOptions = {}): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new UrlNotAllowedError('URL inválida');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new UrlNotAllowedError(`Esquema no permitido: ${parsed.protocol}`);
  }
  if (options.requireHttps && parsed.protocol !== 'https:') {
    throw new UrlNotAllowedError('Se exige https');
  }
  if (parsed.username !== '' || parsed.password !== '') {
    throw new UrlNotAllowedError('La URL no puede incluir credenciales');
  }
  const hostname = parsed.hostname.toLowerCase();
  const host = parsed.host.toLowerCase();
  const allowed = parseAllowlist(allowlistCsv).some((entry) => matchesEntry(entry, hostname, host));
  if (!allowed) {
    throw new UrlNotAllowedError(`Host no permitido: ${hostname}`);
  }
  return parsed;
}

/** Variante booleana de {@link assertAllowedUrl}. */
export function isAllowedUrl(url: string, allowlistCsv: string | readonly string[], options: AllowedUrlOptions = {}): boolean {
  try {
    assertAllowedUrl(url, allowlistCsv, options);
    return true;
  } catch {
    return false;
  }
}
