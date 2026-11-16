import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import bcrypt from 'bcryptjs';
import { buildCsp, safeNextPath } from './csp';
import { LoginThrottle, throttleKeys, WINDOW_MS } from './login-throttle';
import { AdminUsersConfigError, parseAdminUsers, verifyCredentials } from './users';

describe('bloqueo por intentos fallidos', () => {
  it('bloquea al 5.º fallo en 15 min y libera al pasar la ventana', () => {
    const t = new LoginThrottle();
    const key = throttleKeys('Admin@Capsur.local', '10.0.0.1').pair;
    const start = 1_000_000;
    for (let i = 0; i < 4; i++) t.registerFailure(key, start + i);
    assert.equal(t.isBlocked(key, start + 10), false);
    t.registerFailure(key, start + 5);
    assert.equal(t.isBlocked(key, start + 10), true);
    assert.ok(t.retryAfterMs(key, start + 10) > 14 * 60 * 1000);
    assert.equal(t.isBlocked(key, start + WINDOW_MS + 10), false);
  });

  it('normaliza el correo en la clave y reinicia tras un acceso correcto', () => {
    assert.equal(throttleKeys('A@B.PE', '1.1.1.1').pair, throttleKeys(' a@b.pe', '1.1.1.1').pair);
    const t = new LoginThrottle(2);
    t.registerFailure('k', 1);
    t.registerFailure('k', 2);
    assert.equal(t.isBlocked('k', 3), true);
    t.reset('k');
    assert.equal(t.isBlocked('k', 3), false);
  });
});

describe('usuarios del panel', () => {
  const hash = bcrypt.hashSync('cambia-esta-clave-123', 4);
  const json = JSON.stringify([{ email: 'Admin@Capsur.local', name: 'Admin', role: 'admin', passwordHash: hash }]);

  it('verifica credenciales con bcrypt sin distinguir mayúsculas en el correo', async () => {
    const users = parseAdminUsers(json);
    assert.deepEqual(await verifyCredentials(users, 'admin@capsur.local', 'cambia-esta-clave-123'), {
      email: 'admin@capsur.local',
      name: 'Admin',
      role: 'admin',
    });
    assert.equal(await verifyCredentials(users, 'admin@capsur.local', 'otra'), null);
    assert.equal(await verifyCredentials(users, 'nadie@capsur.local', 'cambia-esta-clave-123'), null);
  });

  it('rechaza configuraciones inválidas con mensajes claros', () => {
    assert.throws(() => parseAdminUsers(undefined), AdminUsersConfigError);
    assert.throws(() => parseAdminUsers('{no json'), /JSON válido/);
    assert.throws(() => parseAdminUsers(JSON.stringify([{ email: 'a@b.pe', name: 'A', role: 'root', passwordHash: hash }])), /role/);
    assert.throws(() => parseAdminUsers(JSON.stringify([{ email: 'a@b.pe', name: 'A', role: 'admin', passwordHash: 'texto-plano' }])), /bcrypt/);
  });
});

describe('CSP y redirección tras login', () => {
  it('CSP estricta con nonce en producción', () => {
    const csp = buildCsp('abc123', { dev: false, https: true });
    assert.match(csp, /script-src 'self' 'nonce-abc123' 'strict-dynamic'(;|$)/);
    assert.match(csp, /style-src 'self' 'nonce-abc123'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /upgrade-insecure-requests/);
    assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/);
  });

  it('solo acepta rutas internas como destino', () => {
    assert.equal(safeNextPath('/leads?status=crm_failed'), '/leads?status=crm_failed');
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil.com', '/login', null, 42]) {
      assert.equal(safeNextPath(bad), null, String(bad));
    }
  });
});
