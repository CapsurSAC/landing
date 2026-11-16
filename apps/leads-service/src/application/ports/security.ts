/**
 * Puertos de seguridad que usa la capa de aplicación: límites por clave de
 * negocio (C2), captcha (C3) y hash de datos personales (C8).
 */

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

/** Límite por clave de negocio compartido entre réplicas (Redis) con degradación a memoria. */
export interface RateLimiter {
  consume(key: string, limit: number, windowMs: number): Promise<RateLimitResult>;
}

export const RATE_LIMITER = Symbol('RATE_LIMITER');

export type CaptchaStatus = 'ok' | 'invalid' | 'unavailable' | 'skipped';

/** Verificación de Cloudflare Turnstile; `skipped` si no hay secreto configurado. */
export interface CaptchaVerifier {
  verify(token: string | null | undefined, remoteIp: string | null): Promise<CaptchaStatus>;
}

export const CAPTCHA_VERIFIER = Symbol('CAPTCHA_VERIFIER');

/**
 * HMAC de un dato personal ya normalizado (E.164, correo en minúsculas) para
 * duplicados, límites y búsquedas sin guardar el dato en claro.
 */
export interface PersonalDataHasher {
  hash(normalizedValue: string): string;
}

export const PERSONAL_DATA_HASHER = Symbol('PERSONAL_DATA_HASHER');
