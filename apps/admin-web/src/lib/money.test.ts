import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { centsToSoles, formatSoles, solesToCents } from './money';

describe('soles ↔ céntimos', () => {
  it('convierte soles a céntimos sin errores de coma flotante', () => {
    assert.equal(solesToCents('249'), 24900);
    assert.equal(solesToCents('249.9'), 24990);
    assert.equal(solesToCents('249.90'), 24990);
    assert.equal(solesToCents('0.29'), 29);
    assert.equal(solesToCents('1.15'), 115); // 1.15 * 100 = 114.99999 en float
    assert.equal(solesToCents('249,50'), 24950);
    assert.equal(solesToCents(' S/ 1 249.50 '), 124950);
    assert.equal(solesToCents('0'), 0);
  });

  it('rechaza montos inválidos', () => {
    for (const bad of ['', 'abc', '-1', '1.234', '1e3', '12.', '.5', '1,2,3']) {
      assert.equal(solesToCents(bad), null, bad);
    }
  });

  it('convierte céntimos a soles para el formulario', () => {
    assert.equal(centsToSoles(24990), '249.90');
    assert.equal(centsToSoles(5), '0.05');
    assert.equal(centsToSoles(0), '0.00');
    assert.throws(() => centsToSoles(-1), RangeError);
    assert.throws(() => centsToSoles(1.5), RangeError);
  });

  it('ida y vuelta conserva el valor', () => {
    for (const cents of [0, 1, 99, 100, 24900, 49900, 123456]) {
      assert.equal(solesToCents(centsToSoles(cents)), cents);
    }
  });

  it('formatea en soles peruanos', () => {
    assert.match(formatSoles(24990), /S\/\s?249\.90/);
  });
});
