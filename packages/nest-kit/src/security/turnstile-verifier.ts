import { ProblemException } from '../errors/problem-exception';

/** Endpoint oficial de verificación de Cloudflare Turnstile. */
export const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Resultado de una verificación. */
export type TurnstileStatus = 'ok' | 'invalid' | 'unavailable' | 'skipped';

export interface TurnstileResult {
  status: TurnstileStatus;
  /** Códigos de error de Cloudflare (solo diagnóstico; no exponer al usuario). */
  errorCodes: string[];
}

/** Firma mínima de `fetch` (permite inyectar un doble en pruebas). */
export type FetchLike = (input: string, init: { method: string; body: URLSearchParams; signal: AbortSignal; headers: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Opciones de {@link TurnstileVerifier}. */
export interface TurnstileVerifierOptions {
  /** `TURNSTILE_SECRET_KEY`. Vacío = no se exige captcha (`skipped`). */
  secret?: string | null;
  /** Tiempo máximo de la llamada. Por defecto 3000 ms. */
  timeoutMs?: number;
  /** Por defecto el `fetch` global. */
  fetch?: FetchLike;
  /** Por defecto {@link TURNSTILE_VERIFY_URL}. */
  endpoint?: string;
}

const UNAVAILABLE_CODES = new Set(['internal-error']);

function readResponse(body: unknown): { success: boolean; errorCodes: string[] } {
  if (typeof body !== 'object' || body === null) {
    return { success: false, errorCodes: ['invalid-response'] };
  }
  const record = body as { success?: unknown; 'error-codes'?: unknown };
  const errorCodes = Array.isArray(record['error-codes'])
    ? record['error-codes'].filter((code): code is string => typeof code === 'string')
    : [];
  return { success: record.success === true, errorCodes };
}

/**
 * Verificación de Cloudflare Turnstile (C3) con timeout de 3 s:
 * - sin secreto → `skipped`;
 * - token vacío o rechazado → `invalid`;
 * - fallo de red, timeout, 5xx o `internal-error` → `unavailable`.
 */
export class TurnstileVerifier {
  private readonly secret: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly endpoint: string;

  constructor(options: TurnstileVerifierOptions = {}) {
    this.secret = (options.secret ?? '').trim();
    this.timeoutMs = options.timeoutMs ?? 3000;
    this.fetchImpl = options.fetch ?? (fetch as unknown as FetchLike);
    this.endpoint = options.endpoint ?? TURNSTILE_VERIFY_URL;
  }

  /** `true` si hay secreto configurado y por tanto se exige token. */
  get enabled(): boolean {
    return this.secret !== '';
  }

  async verify(token: string | null | undefined, remoteIp?: string | null): Promise<TurnstileResult> {
    if (!this.enabled) {
      return { status: 'skipped', errorCodes: [] };
    }
    const response = (token ?? '').trim();
    if (response === '' || response.length > 2048) {
      return { status: 'invalid', errorCodes: ['missing-input-response'] };
    }
    const body = new URLSearchParams({ secret: this.secret, response });
    if (remoteIp) {
      body.set('remoteip', remoteIp);
    }
    try {
      const result = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        body,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!result.ok) {
        return { status: 'unavailable', errorCodes: [`http-${result.status}`] };
      }
      const { success, errorCodes } = readResponse(await result.json());
      if (success) {
        return { status: 'ok', errorCodes };
      }
      return { status: errorCodes.some((code) => UNAVAILABLE_CODES.has(code)) ? 'unavailable' : 'invalid', errorCodes };
    } catch {
      return { status: 'unavailable', errorCodes: ['network-error'] };
    }
  }

  /**
   * Verifica y lanza el problem-details de la spec si no pasa:
   * 400 `CAPTCHA_INVALID` o 503 `CAPTCHA_UNAVAILABLE`.
   */
  async verifyOrThrow(token: string | null | undefined, remoteIp?: string | null): Promise<TurnstileResult> {
    const result = await this.verify(token, remoteIp);
    if (result.status === 'invalid') {
      throw new ProblemException({
        status: 400,
        title: 'Verificación anti-bots fallida',
        code: 'CAPTCHA_INVALID',
        detail: 'No pudimos verificar que no eres un robot. Recarga la página e inténtalo de nuevo.',
      });
    }
    if (result.status === 'unavailable') {
      throw new ProblemException({
        status: 503,
        title: 'Verificación anti-bots no disponible',
        code: 'CAPTCHA_UNAVAILABLE',
        detail: 'El servicio de verificación no responde. Inténtalo de nuevo en unos segundos.',
        headers: { 'Retry-After': '10' },
      });
    }
    return result;
  }
}
