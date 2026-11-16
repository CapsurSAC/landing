import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SignJWT } from 'jose';
import {
  isSecureCookieEnv,
  SESSION_TTL_SECONDS,
  SessionConfigError,
  sessionCookieName,
  sessionCookieOptions,
  signSession,
  verifySession,
} from './session';

const SECRET = 'x'.repeat(40);
const USER = { email: 'admin@capsur.local', name: 'Admin', role: 'admin' as const };

describe('sesión JWT', () => {
  it('firma y verifica una sesión válida', async () => {
    const now = new Date('2026-11-13T15:00:00Z');
    const token = await signSession(USER, SECRET, now);
    const session = await verifySession(token, SECRET, new Date(now.getTime() + 60_000));
    assert.ok(session);
    assert.equal(session.email, USER.email);
    assert.equal(session.role, 'admin');
    assert.equal(session.expiresAt - session.issuedAt, SESSION_TTL_SECONDS);
  });

  it('caduca a las 8 horas', async () => {
    const now = new Date('2026-11-13T15:00:00Z');
    const token = await signSession(USER, SECRET, now);
    const justBefore = new Date(now.getTime() + (SESSION_TTL_SECONDS - 60) * 1000);
    const after = new Date(now.getTime() + (SESSION_TTL_SECONDS + 1) * 1000);
    assert.ok(await verifySession(token, SECRET, justBefore));
    assert.equal(await verifySession(token, SECRET, after), null);
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const token = await signSession(USER, 'y'.repeat(40));
    assert.equal(await verifySession(token, SECRET), null);
  });

  it('rechaza un token manipulado (rol cambiado)', async () => {
    const token = await signSession({ ...USER, role: 'asesor' }, SECRET);
    const [header, , signature] = token.split('.');
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString());
    payload.role = 'admin';
    const forged = `${header}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${signature}`;
    assert.equal(await verifySession(forged, SECRET), null);
  });

  it('rechaza alg "none" y roles desconocidos', async () => {
    const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: USER.email, role: 'admin', name: 'x', iat: 1, exp: 9_999_999_999 }),
    ).toString('base64url')}.`;
    assert.equal(await verifySession(unsigned, SECRET), null);

    const key = new TextEncoder().encode(SECRET);
    const badRole = await new SignJWT({ name: 'x', role: 'root' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(USER.email)
      .setIssuer('capsur-admin-web')
      .setAudience('capsur-admin-web')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(key);
    assert.equal(await verifySession(badRole, SECRET), null);
  });

  it('devuelve null sin token y lanza un error claro si el secreto es corto o falta', async () => {
    assert.equal(await verifySession(undefined, SECRET), null);
    await assert.rejects(() => signSession(USER, 'corto'), SessionConfigError);
    await assert.rejects(() => verifySession('a.b.c', undefined), /ADMIN_SESSION_SECRET/);
  });

  it('usa __Host- y Secure solo con cookies seguras', () => {
    assert.equal(sessionCookieName(true), '__Host-capsur_admin');
    assert.equal(sessionCookieName(false), 'capsur_admin');
    assert.equal(isSecureCookieEnv({ NODE_ENV: 'production' }), true);
    assert.equal(isSecureCookieEnv({ NODE_ENV: 'development' }), false);
    assert.equal(isSecureCookieEnv({ NODE_ENV: 'production', ADMIN_COOKIE_SECURE: 'false' }), false);
    const opts = sessionCookieOptions(true);
    assert.deepEqual(
      { httpOnly: opts.httpOnly, sameSite: opts.sameSite, secure: opts.secure, path: opts.path, maxAge: opts.maxAge },
      { httpOnly: true, sameSite: 'strict', secure: true, path: '/', maxAge: 8 * 3600 },
    );
  });
});
