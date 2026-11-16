import { PromotionsResponseSchema, SpecialtySchema } from '@capsur/api-contracts';
import { makePromotion, makeSpecialty, SIS_BRAND } from '../../../test/support/fakes';
import { Brand, BrandNotFoundError } from '../../domain';
import { toContractBrand, toContractPromotion, toContractSpecialty } from './contract.mapper';

describe('contract.mapper', () => {
  it('mapea una promoción con listPrice y enums en minúsculas conforme al contrato', () => {
    const promotion = makePromotion({
      id: 'dos-por-uno',
      icon: 'gift',
      listPrice: { amount: 49800, currency: 'PEN' },
      bundle: { specialtiesIncluded: 2, allowedTracks: ['ia', 'tradicional'], label: 'IA + tradicional' },
      validUntil: new Date('2026-12-31T23:59:59.000Z'),
    });

    const dto = toContractPromotion(promotion, 'sis');
    const response = PromotionsResponseSchema.parse({
      brand: 'sis',
      items: [dto],
      generatedAt: new Date().toISOString(),
    });

    expect(response.items[0]).toMatchObject({
      id: 'dos-por-uno',
      icon: 'gift',
      price: { amount: 49800 / 2, currency: 'PEN' },
      listPrice: { amount: 49800, currency: 'PEN' },
      bundle: { allowedTracks: ['ia', 'tradicional'] },
      validFrom: '2026-11-01T00:00:00.000Z',
      validUntil: '2026-12-31T23:59:59.000Z',
    });
  });

  it('omite listPrice cuando no existe y deja validUntil en null', () => {
    const dto = toContractPromotion(makePromotion(), 'sis');

    expect(dto).not.toHaveProperty('listPrice');
    expect(dto.validUntil).toBeNull();
    expect(() => PromotionsResponseSchema.parse({ brand: 'sis', items: [dto], generatedAt: '2026-11-13T00:00:00.000Z' })).not.toThrow();
  });

  it('mapea una especialidad con campos opcionales conforme al contrato', () => {
    const withShortName = toContractSpecialty(
      makeSpecialty({ shortName: 'Computación e Informática', endorsedBy: null }),
      'sis',
    );
    const minimal = toContractSpecialty(makeSpecialty({ shortName: null, endorsedBy: null }), 'sis');

    expect(() => SpecialtySchema.parse(withShortName)).not.toThrow();
    expect(withShortName.shortName).toBe('Computación e Informática');
    expect(minimal).not.toHaveProperty('shortName');
    expect(minimal).not.toHaveProperty('endorsedBy');
  });

  it('acepta las marcas del contrato y rechaza las que no están publicadas', () => {
    expect(toContractBrand(SIS_BRAND)).toBe('sis');
    expect(() =>
      toContractBrand(new Brand({ id: 'avanti', name: 'Avanti', displayName: 'Avanti', active: true })),
    ).toThrow(BrandNotFoundError);
  });
});
