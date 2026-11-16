import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AdminLeadListQuerySchema } from '@capsur/api-contracts';
import { hasActiveFilters, parseLeadFilters, toPanelQuery, toServiceQuery } from './lead-filters';

describe('filtros de leads', () => {
  it('lee filtros válidos de la URL', () => {
    const f = parseLeadFilters({
      status: 'crm_failed',
      promotionId: 'con-ia',
      campus: 'arequipa',
      utmCampaign: 'nov-2026',
      from: '2026-11-01',
      to: '2026-11-13',
      q: ' SIS-7K3M2 ',
      page: '3',
      pageSize: '50',
    });
    assert.deepEqual(f, {
      status: 'crm_failed',
      promotionId: 'con-ia',
      campus: 'arequipa',
      utmCampaign: 'nov-2026',
      from: '2026-11-01',
      to: '2026-11-13',
      q: 'SIS-7K3M2',
      page: 3,
      pageSize: 50,
    });
    assert.equal(hasActiveFilters(f), true);
  });

  it('descarta valores inválidos y aplica valores por defecto', () => {
    const f = parseLeadFilters({
      status: 'borrado',
      campus: 'lima',
      promotionId: 'Con IA!',
      from: '2026-02-30',
      page: '-2',
      pageSize: '7',
      q: '',
    });
    assert.deepEqual(f, { page: 1, pageSize: 25 });
    assert.equal(hasActiveFilters(f), false);
  });

  it('toma el primer valor si un parámetro se repite e intercambia un rango invertido', () => {
    const f = parseLeadFilters({ status: ['registered', 'crm_synced'], from: '2026-11-13', to: '2026-11-01' });
    assert.equal(f.status, 'registered');
    assert.equal(f.from, '2026-11-01');
    assert.equal(f.to, '2026-11-13');
  });

  it('construye la consulta del servicio con fechas ISO del día completo de Lima', () => {
    const f = parseLeadFilters({ campus: 'tacna', from: '2026-11-01', to: '2026-11-13', q: 'ana@correo.pe', page: '2' });
    const qs = toServiceQuery(f, 'sis');
    assert.equal(qs.get('brand'), 'sis');
    assert.equal(qs.get('from'), '2026-11-01T05:00:00.000Z');
    assert.equal(qs.get('to'), '2026-11-14T04:59:59.999Z');
    assert.equal(qs.get('page'), '2');
    assert.equal(qs.get('q'), 'ana@correo.pe');
    // La consulta cumple el contrato de leads-service.
    assert.equal(AdminLeadListQuerySchema.safeParse(Object.fromEntries(qs)).success, true);
  });

  it('el CSV usa los mismos filtros sin paginación', () => {
    const qs = toServiceQuery(parseLeadFilters({ status: 'crm_synced', page: '4' }), 'sis', { paginate: false });
    assert.equal(qs.has('page'), false);
    assert.equal(qs.has('pageSize'), false);
    assert.equal(qs.get('status'), 'crm_synced');
  });

  it('genera la query del panel omitiendo los valores por defecto', () => {
    const f = parseLeadFilters({ status: 'registered', q: 'SIS 1', page: '1' });
    assert.equal(toPanelQuery(f), '?status=registered&q=SIS+1');
    assert.equal(toPanelQuery(f, { page: 2 }), '?status=registered&q=SIS+1&page=2');
    assert.equal(toPanelQuery(parseLeadFilters({})), '');
  });
});
