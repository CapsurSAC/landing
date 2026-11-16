import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { can, homeFor, isRole, navFor, PERMISSIONS } from './roles';

describe('control de roles', () => {
  it('admin tiene todos los permisos', () => {
    for (const p of PERMISSIONS) assert.equal(can('admin', p), true, p);
  });

  it('asesor solo lee leads: sin exportar, anonimizar ni gestionar', () => {
    assert.equal(can('asesor', 'leads:read'), true);
    for (const p of PERMISSIONS.filter((x) => x !== 'leads:read')) assert.equal(can('asesor', p), false, p);
  });

  it('niega todo a roles desconocidos o ausentes', () => {
    assert.equal(can(null, 'leads:read'), false);
    assert.equal(can(undefined, 'leads:read'), false);
    // @ts-expect-error rol inválido a propósito
    assert.equal(can('root', 'leads:read'), false);
    assert.equal(isRole('admin'), true);
    assert.equal(isRole('superadmin'), false);
  });

  it('la navegación y el inicio dependen del rol', () => {
    assert.deepEqual(
      navFor('asesor').map((i) => i.href),
      ['/leads'],
    );
    assert.equal(navFor('admin').length, 6);
    assert.equal(homeFor('admin'), '/');
    assert.equal(homeFor('asesor'), '/leads');
  });
});
