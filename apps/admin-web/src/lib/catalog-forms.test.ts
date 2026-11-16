import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AdminPromotion } from '@capsur/api-contracts';
import { parsePromotionForm, parseSpecialtyForm, promotionToFormValues, readPromotionForm, type PromotionFormValues } from './catalog-forms';

const VALID: PromotionFormValues = {
  id: 'pack-ia-pro',
  name: 'PACK IA PRO',
  headline: 'S/499',
  price: '499',
  listPrice: '699.90',
  specialtiesIncluded: '2',
  allowedTracks: ['ia'],
  bundleLabel: '2 especialidades',
  featured: true,
  icon: 'stack',
  validFrom: '2026-11-15T00:00',
  validUntil: '2026-11-30T23:59',
  campaignId: '',
  sortOrder: '3',
  active: true,
};

describe('formulario de promoción', () => {
  it('convierte soles y hora de Lima al contrato', () => {
    const r = parsePromotionForm(VALID, 'sis');
    assert.ok(r.ok);
    assert.deepEqual(r.input.price, { amount: 49900, currency: 'PEN' });
    assert.deepEqual(r.input.listPrice, { amount: 69990, currency: 'PEN' });
    assert.equal(r.input.validFrom, '2026-11-15T05:00:00.000Z');
    assert.equal(r.input.validUntil, '2026-12-01T04:59:00.000Z');
    assert.equal(r.input.campaignId, null);
    assert.equal(r.input.brand, 'sis');
    assert.deepEqual(r.input.bundle, { specialtiesIncluded: 2, allowedTracks: ['ia'], label: '2 especialidades' });
  });

  it('marca los errores por campo en español', () => {
    const r = parsePromotionForm(
      { ...VALID, id: 'Pack IA', price: '4,999.00', listPrice: '100', allowedTracks: [], validUntil: '2026-11-01T00:00' },
      'sis',
    );
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.ok(r.errors.id);
    assert.ok(r.errors.price);
    assert.ok(r.errors.allowedTracks);
    assert.ok(r.errors.validUntil);
  });

  it('exige que el precio tachado sea mayor', () => {
    const r = parsePromotionForm({ ...VALID, listPrice: '400' }, 'sis');
    assert.equal(r.ok, false);
    if (!r.ok) assert.match(r.errors.listPrice!, /mayor/);
  });

  it('ida y vuelta desde una promoción guardada', () => {
    const saved: AdminPromotion = {
      id: 'con-ia',
      brand: 'sis',
      name: 'CON IA',
      headline: 'S/249',
      price: { amount: 24900, currency: 'PEN' },
      bundle: { specialtiesIncluded: 1, allowedTracks: ['ia', 'tradicional'], label: '1 especialidad' },
      featured: false,
      icon: 'layers',
      validFrom: '2026-11-01T05:00:00.000Z',
      validUntil: null,
      campaignId: 'nov-2026',
      sortOrder: 1,
      active: true,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
    };
    const values = promotionToFormValues(saved);
    assert.equal(values.price, '249.00');
    assert.equal(values.validFrom, '2026-11-01T00:00');
    const r = parsePromotionForm(values, 'sis');
    assert.ok(r.ok);
    assert.equal(r.input.price.amount, 24900);
    assert.equal(r.input.validFrom, saved.validFrom);
    assert.equal(r.input.validUntil, null);
    assert.equal(r.input.listPrice, undefined);
  });

  it('lee FormData con varios tracks y casillas', () => {
    const fd = new FormData();
    fd.set('id', ' con-ia ');
    fd.append('allowedTracks', 'ia');
    fd.append('allowedTracks', 'tradicional');
    fd.set('featured', 'on');
    const v = readPromotionForm(fd);
    assert.equal(v.id, 'con-ia');
    assert.deepEqual(v.allowedTracks, ['ia', 'tradicional']);
    assert.equal(v.featured, true);
    assert.equal(v.active, false);
  });
});

describe('formulario de especialidad', () => {
  it('convierte el público objetivo (una línea por perfil)', () => {
    const r = parseSpecialtyForm(
      {
        id: 'analitica-ia',
        name: 'Analítica de datos con IA',
        shortName: '',
        track: 'ia',
        summary: 'Aprende a analizar datos con herramientas de IA.',
        audience: 'Egresados técnicos\n\n  Profesionales en actividad  \n',
        modality: '100% virtual',
        endorsedBy: '',
        sortOrder: '2',
        active: true,
      },
      'sis',
    );
    assert.ok(r.ok);
    assert.deepEqual(r.input.audience, ['Egresados técnicos', 'Profesionales en actividad']);
    assert.equal(r.input.shortName, undefined);
  });
});
