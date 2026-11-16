import 'server-only';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { LoginThrottle, MAX_FAILURES_PER_IP, throttleKeys } from '../login-throttle';
import { can, type Permission } from '../roles';
import {
  isSecureCookieEnv,
  sessionCookieName,
  sessionCookieOptions,
  signSession,
  verifySession,
  type SessionUser,
} from '../session';
import { findUser, parseAdminUsers, verifyCredentials, type AdminUser } from '../users';
import { audit } from './log';

/* ------------------------------- configuración ---------------------------- */

let usersCache: { raw: string | undefined; users: AdminUser[] } | null = null;

/** Usuarios de ADMIN_USERS_JSON (se vuelve a parsear si la variable cambia). */
export function adminUsers(): AdminUser[] {
  const raw = process.env.ADMIN_USERS_JSON;
  if (usersCache && usersCache.raw === raw) return usersCache.users;
  const users = parseAdminUsers(raw);
  usersCache = { raw, users };
  return users;
}

function secureCookies(): boolean {
  return isSecureCookieEnv(process.env);
}

export function cookieName(): string {
  return sessionCookieName(secureCookies());
}

/* --------------------------------- sesión --------------------------------- */

/**
 * Usuario de la petición actual. Además de verificar el JWT, comprueba que la
 * cuenta SIGUE existiendo en ADMIN_USERS_JSON y toma de ahí el rol vigente:
 * quitar a alguien de la lista o cambiar su rol surte efecto de inmediato.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const session = await verifySession(store.get(cookieName())?.value, process.env.ADMIN_SESSION_SECRET);
  if (!session) return null;
  const user = findUser(adminUsers(), session.email);
  if (!user) return null;
  return { email: user.email, name: user.name, role: user.role };
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}

/** Para páginas: sin sesión → /login; sin permiso → /sin-permiso. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect('/sin-permiso');
  return user;
}

export type ActionAuth = { ok: true; user: SessionUser } | { ok: false; error: string };

/** Para acciones de servidor: nunca confía en que la UI haya ocultado el botón. */
export async function authorizeAction(permission: Permission): Promise<ActionAuth> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Tu sesión caducó. Vuelve a iniciar sesión.' };
  if (!can(user.role, permission)) return { ok: false, error: 'Tu rol no permite realizar esta acción.' };
  return { ok: true, user };
}

export async function startSession(user: SessionUser): Promise<void> {
  const token = await signSession(user, process.env.ADMIN_SESSION_SECRET);
  const store = await cookies();
  store.set(cookieName(), token, sessionCookieOptions(secureCookies()));
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete({ name: cookieName(), path: '/', secure: secureCookies(), httpOnly: true, sameSite: 'strict' });
}

/* ------------------------------ inicio de sesión -------------------------- */

const pairThrottle = new LoginThrottle();
const ipThrottle = new LoginThrottle(MAX_FAILURES_PER_IP);

/**
 * IP del cliente. Detrás del gateway (Traefik) llega en X-Forwarded-For; el
 * panel NO debe exponerse sin ese proxy delante, porque la cabecera la podría
 * fijar el propio cliente.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || h.get('x-real-ip')?.trim() || 'desconocida';
}

export type LoginOutcome =
  | { ok: true; user: SessionUser }
  | { ok: false; reason: 'invalid' }
  | { ok: false; reason: 'blocked'; retryAfterMinutes: number };

export async function attemptLogin(email: string, password: string): Promise<LoginOutcome> {
  const ip = await clientIp();
  const keys = throttleKeys(email, ip);
  const wait = Math.max(pairThrottle.retryAfterMs(keys.pair), ipThrottle.retryAfterMs(keys.ip));
  if (wait > 0) return { ok: false, reason: 'blocked', retryAfterMinutes: Math.ceil(wait / 60_000) };

  const user = await verifyCredentials(adminUsers(), email, password);
  if (!user) {
    pairThrottle.registerFailure(keys.pair);
    ipThrottle.registerFailure(keys.ip);
    audit('admin.login.failed', null, { ip });
    return { ok: false, reason: 'invalid' };
  }
  pairThrottle.reset(keys.pair);
  audit('admin.login.succeeded', user.email, { ip });
  return { ok: true, user };
}
