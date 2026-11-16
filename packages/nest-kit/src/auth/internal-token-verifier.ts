import { createHash, timingSafeEqual } from 'node:crypto';

/** Mapa llamador → token, tal como llega en `INTERNAL_API_TOKENS`. */
export type InternalTokens = Readonly<Record<string, string>>;

/**
 * Interpreta `INTERNAL_API_TOKENS` (JSON `{ "<caller>": "<token>" }`) o
 * acepta el objeto ya validado por `@capsur/config`. Lanza con un mensaje
 * claro (sin revelar tokens) si el formato no es válido.
 */
export function parseInternalTokens(input: string | InternalTokens | undefined | null): Record<string, string> {
  if (input === undefined || input === null || input === '') {
    return {};
  }
  let value: unknown = input;
  if (typeof input === 'string') {
    try {
      value = JSON.parse(input);
    } catch {
      throw new Error('INTERNAL_API_TOKENS no es un JSON válido: se espera {"<llamador>":"<token>"}');
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('INTERNAL_API_TOKENS debe ser un objeto JSON {"<llamador>":"<token>"}');
  }
  const tokens: Record<string, string> = {};
  for (const [caller, token] of Object.entries(value)) {
    if (typeof token !== 'string' || token.trim() === '') {
      throw new Error(`INTERNAL_API_TOKENS: el token del llamador "${caller}" debe ser un texto no vacío`);
    }
    tokens[caller] = token.trim();
  }
  return tokens;
}

function digest(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Identifica al llamador por su token. Compara digests SHA-256 (longitud
 * fija) con `crypto.timingSafeEqual` y recorre siempre todos los tokens, de
 * modo que el tiempo no revela ni el token ni cuál coincidió.
 */
export class InternalTokenVerifier {
  private readonly entries: ReadonlyArray<{ caller: string; digest: Buffer }>;

  constructor(tokens: string | InternalTokens | undefined | null) {
    this.entries = Object.entries(parseInternalTokens(tokens)).map(([caller, token]) => ({
      caller,
      digest: digest(token),
    }));
  }

  /** Número de llamadores configurados (0 = nadie puede llamar a `/internal/*`). */
  get size(): number {
    return this.entries.length;
  }

  /** Nombres de los llamadores configurados (para logs de arranque; nunca los tokens). */
  get callers(): string[] {
    return this.entries.map((entry) => entry.caller);
  }

  /** Devuelve el llamador dueño de `token`, o `null`. */
  identify(token: string | undefined | null): string | null {
    if (!token) {
      return null;
    }
    const candidate = digest(token);
    let match: string | null = null;
    for (const entry of this.entries) {
      if (timingSafeEqual(candidate, entry.digest) && match === null) {
        match = entry.caller;
      }
    }
    return match;
  }

  /** Extrae el token de `Authorization: Bearer <token>` e identifica al llamador. */
  identifyAuthorization(header: string | string[] | undefined): string | null {
    const value = Array.isArray(header) ? header[0] : header;
    if (typeof value !== 'string') {
      return null;
    }
    const match = /^Bearer\s+(\S+)\s*$/i.exec(value);
    return match?.[1] ? this.identify(match[1]) : null;
  }
}
