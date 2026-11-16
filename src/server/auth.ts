import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';

/**
 * Acceso al panel. Un solo usuario definido en el entorno:
 *   ADMIN_USER=correo@dominio.com
 *   ADMIN_PASSWORD_HASH=scrypt:<sal>:<hash>   ← node scripts/hash-password.mjs "contraseña"
 *   ADMIN_SESSION_SECRET=<32+ caracteres aleatorios>
 * La sesión es una cookie firmada (HMAC), HttpOnly y SameSite=Strict, que caduca a las 8 horas.
 */

export const SESSION_COOKIE = 'sis_admin';
const SESSION_HOURS = 8;
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

function env(name: string): string {
  return (process.env[name] ?? '').trim();
}

export function adminConfigured(): boolean {
  return Boolean(env('ADMIN_USER') && env('ADMIN_PASSWORD_HASH') && env('ADMIN_SESSION_SECRET').length >= 32);
}

function safeEqual(a: Buffer, b: Buffer): boolean {
  // Longitudes distintas: se compara contra sí mismo para no filtrar tiempos.
  if (a.length !== b.length) {
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function hashPassword(password: string, salt: string): string {
  return `scrypt:${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hash] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  return safeEqual(Buffer.from(hashPassword(password, salt)), Buffer.from(stored));
}

/* shortcut: el límite de intentos vive en memoria (se reinicia con el servidor y no se comparte entre instancias). */
const attempts = new Map<string, number[]>();

export function tooManyAttempts(key: string, now = Date.now()): boolean {
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < ATTEMPT_WINDOW_MS);
  attempts.set(key, recent);
  return recent.length >= MAX_ATTEMPTS;
}

export function recordFailedAttempt(key: string, now = Date.now()): void {
  attempts.set(key, [...(attempts.get(key) ?? []), now]);
}

/** Comprueba usuario y contraseña; ambos siempre, para no delatar cuál falló. */
export function checkCredentials(user: string, password: string): boolean {
  const userOk = safeEqual(Buffer.from(user.trim().toLowerCase()), Buffer.from(env('ADMIN_USER').toLowerCase()));
  const passOk = verifyPassword(password, env('ADMIN_PASSWORD_HASH'));
  return userOk && passOk;
}

function sign(payload: string): string {
  return createHmac('sha256', env('ADMIN_SESSION_SECRET')).update(payload).digest('base64url');
}

export function createSessionToken(user: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ u: user, exp: now + SESSION_HOURS * 60 * 60 * 1000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function readSessionToken(token: string | undefined, now = Date.now()): string | null {
  if (!token || !adminConfigured()) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u?: unknown; exp?: unknown };
    if (typeof data.u !== 'string' || typeof data.exp !== 'number' || data.exp <= now) return null;
    return data.u;
  } catch {
    return null;
  }
}

/** Usuario con sesión válida en esta petición, o null. */
export async function currentAdmin(): Promise<string | null> {
  return readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function startSession(user: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/admin',
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete({ name: SESSION_COOKIE, path: '/admin' });
}
