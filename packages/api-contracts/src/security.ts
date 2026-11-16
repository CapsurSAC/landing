/**
 * Utilidades de seguridad compartidas que no dependen de Node ni del navegador.
 */

/**
 * Serializa JSON para incrustarlo en un <script> (JSON-LD) sin permitir que
 * un valor cierre la etiqueta ni inyecte HTML: escapa <, >, & y los
 * separadores de línea U+2028/U+2029.
 */
export function safeJsonForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .split(String.fromCharCode(0x2028))
    .join('\\u2028')
    .split(String.fromCharCode(0x2029))
    .join('\\u2029');
}

/** Formato aceptado para la cabecera Idempotency-Key: UUID (v4/v7). */
export const IDEMPOTENCY_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Rutas que nunca deben exponerse por el gateway público. */
export const INTERNAL_PATH_PREFIXES = ['/internal/'] as const;
