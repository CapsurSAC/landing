import { jwtVerify, SignJWT } from 'jose';
import { isRole, type Role } from './roles';

/**
 * Sesión del panel: JWT HS256 firmado con ADMIN_SESSION_SECRET y guardado en
 * una cookie httpOnly. Módulo puro (sin `next/headers`) para poder usarlo en
 * `proxy.ts`, en el servidor y en las pruebas unitarias.
 */

export const SESSION_TTL_SECONDS = 8 * 60 * 60;
export const SESSION_ISSUER = 'capsur-admin-web';
export const SESSION_AUDIENCE = 'capsur-admin-web';
export const MIN_SECRET_LENGTH = 32;

export interface SessionUser {
  email: string;
  name: string;
  role: Role;
}

export interface Session extends SessionUser {
  issuedAt: number;
  expiresAt: number;
}

export class SessionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionConfigError';
  }
}

/** Valida el secreto y lo convierte en clave HMAC. Lanza un error claro si falta o es corto. */
export function sessionKey(secret: string | undefined): Uint8Array {
  if (!secret || secret.trim().length < MIN_SECRET_LENGTH) {
    throw new SessionConfigError(
      `ADMIN_SESSION_SECRET no está definido o tiene menos de ${MIN_SECRET_LENGTH} caracteres. ` +
        'Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64url\'))"',
    );
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(user: SessionUser, secret: string | undefined, now: Date = new Date()): Promise<string> {
  const key = sessionKey(secret);
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({ name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.email)
    .setIssuer(SESSION_ISSUER)
    .setAudience(SESSION_AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + SESSION_TTL_SECONDS)
    .sign(key);
}

/**
 * Verifica firma, algoritmo, emisor, audiencia y caducidad. Devuelve `null`
 * ante cualquier problema (token manipulado, caducado o con datos inválidos).
 * Un secreto mal configurado SÍ lanza: es un error de despliegue, no de sesión.
 */
export async function verifySession(
  token: string | undefined | null,
  secret: string | undefined,
  now: Date = new Date(),
): Promise<Session | null> {
  const key = sessionKey(secret);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
      currentDate: now,
      requiredClaims: ['sub', 'exp', 'iat'],
    });
    const { sub, name, role, iat, exp } = payload;
    if (typeof sub !== 'string' || typeof name !== 'string' || !isRole(role) || !iat || !exp) return null;
    return { email: sub, name, role, issuedAt: iat, expiresAt: exp };
  } catch {
    return null;
  }
}

/**
 * Nombre y atributos de la cookie. Con https (producción) se usa el prefijo
 * `__Host-`, que obliga a `Secure`, `Path=/` y sin `Domain`. En desarrollo por
 * http el navegador rechazaría ese prefijo, así que se usa el nombre sin él.
 */
export function sessionCookieName(secure: boolean): string {
  return secure ? '__Host-capsur_admin' : 'capsur_admin';
}

export function isSecureCookieEnv(env: { NODE_ENV?: string; ADMIN_COOKIE_SECURE?: string }): boolean {
  if (env.ADMIN_COOKIE_SECURE === 'true') return true;
  if (env.ADMIN_COOKIE_SECURE === 'false') return false;
  return env.NODE_ENV === 'production';
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}
