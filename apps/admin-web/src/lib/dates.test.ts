import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addDays,
  daysUntil,
  formatDateTime,
  isDateOnly,
  isoToLimaLocal,
  lastDaysRange,
  limaDay,
  limaDayEndIso,
  limaDayStartIso,
  limaLocalToIso,
} from './dates';

describe('fechas en hora de Lima', () => {
  it('datetime-local de Lima → ISO UTC y vuelta', () => {
    assert.equal(limaLocalToIso('2026-11-20T08:30'), '2026-11-20T13:30:00.000Z');
    assert.equal(limaLocalToIso('2026-12-31T23:00'), '2027-01-01T04:00:00.000Z');
    assert.equal(isoToLimaLocal('2026-11-20T13:30:00.000Z'), '2026-11-20T08:30');
    assert.equal(isoToLimaLocal('2027-01-01T04:00:00Z'), '2026-12-31T23:00');
    const local = '2026-07-15T19:45';
    assert.equal(isoToLimaLocal(limaLocalToIso(local)!), local);
  });

  it('rechaza fechas imposibles o mal formadas', () => {
    assert.equal(limaLocalToIso('2026-02-30T10:00'), null);
    assert.equal(limaLocalToIso('2026-11-20 08:30'), null);
    assert.equal(limaLocalToIso('2026-11-20T24:00'), null);
    assert.equal(limaLocalToIso(''), null);
    assert.equal(isDateOnly('2026-02-29'), false);
    assert.equal(isDateOnly('2028-02-29'), true);
  });

  it('inicio y fin del día de Lima', () => {
    assert.equal(limaDayStartIso('2026-11-01'), '2026-11-01T05:00:00.000Z');
    assert.equal(limaDayEndIso('2026-11-01'), '2026-11-02T04:59:59.999Z');
    assert.equal(limaDayStartIso('2026-13-01'), null);
  });

  it('día de Lima de un instante UTC', () => {
    // 03:00 UTC del 14 = 22:00 del 13 en Lima.
    assert.equal(limaDay(new Date('2026-11-14T03:00:00Z')), '2026-11-13');
    assert.equal(limaDay('2026-11-14T05:00:00Z'), '2026-11-14');
    assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  });

  it('rango de los últimos N días incluye hoy', () => {
    const now = new Date('2026-11-13T20:00:00Z'); // 15:00 en Lima
    assert.deepEqual(lastDaysRange(7, now), { from: '2026-11-07T05:00:00.000Z', to: '2026-11-13T20:00:00.000Z' });
    assert.equal(lastDaysRange(1, now).from, '2026-11-13T05:00:00.000Z');
  });

  it('días restantes hasta el plazo', () => {
    const now = new Date('2026-11-13T15:00:00Z');
    assert.deepEqual(daysUntil('2026-11-20T04:59:59Z', now), { days: 6, overdue: false });
    assert.deepEqual(daysUntil('2026-11-13T23:00:00Z', now), { days: 0, overdue: false });
    assert.deepEqual(daysUntil('2026-11-10T15:00:00Z', now), { days: -3, overdue: true });
  });

  it('formatea en hora de Lima', () => {
    assert.match(formatDateTime('2026-11-14T03:05:00Z'), /13\/11\/2026.*22:05/);
    assert.equal(formatDateTime(null), '—');
  });
});
