import { PromotionValidationSchema } from '@capsur/api-contracts';
import {
  FixedClock,
  InMemoryBrandRepository,
  InMemoryPromotionRepository,
  InMemorySpecialtyRepository,
  makePromotion,
  makeSpecialty,
} from '../../../test/support/fakes';
import { BrandNotFoundError, PromotionNotFoundError } from '../../domain';
import { ValidatePromotion } from './validate-promotion';

const NOW = new Date('2026-11-15T12:00:00.000Z');

function build() {
  const brands = new InMemoryBrandRepository();
  const promotions = new InMemoryPromotionRepository([
    makePromotion({ id: 'con-ia' }),
    makePromotion({
      id: 'vencida',
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
      validUntil: new Date('2026-06-01T00:00:00.000Z'),
    }),
    makePromotion({ id: 'inactiva', active: false }),
  ]);
  const specialties = new InMemorySpecialtyRepository([
    makeSpecialty({ id: 'desarrollo-web-con-ia', track: 'ia' }),
    makeSpecialty({ id: 'computacion-e-informatica', track: 'tradicional', sortOrder: 9 }),
  ]);
  const clock = new FixedClock(NOW);
  const useCase = new ValidatePromotion({ brands, promotions, specialties, clock });
  return { useCase, clock };
}

describe('ValidatePromotion', () => {
  it('devuelve el precio autoritativo y active:true para una promoción vigente', async () => {
    const { useCase } = build();

    const result = await useCase.execute({ brandId: 'sis', promotionId: 'con-ia' });

    expect(result).toEqual({
      specialtiesIncluded: 1,
      allowedSpecialties: [{ id: 'desarrollo-web-con-ia', name: 'Desarrollo Web con Inteligencia Artificial', track: 'ia' }],
      id: 'con-ia',
      brand: 'sis',
      name: 'CON IA',
      headline: 'S/249',
      price: { amount: 24900, currency: 'PEN' },
      active: true,
      campaignId: 'especialidades-ia-2026-11',
    });
    expect(() => PromotionValidationSchema.parse(result)).not.toThrow();
  });

  it('devuelve active:false para una promoción vencida', async () => {
    const { useCase } = build();

    const result = await useCase.execute({ brandId: 'sis', promotionId: 'vencida' });

    expect(result.active).toBe(false);
  });

  it('devuelve active:false para una promoción desactivada', async () => {
    const { useCase } = build();

    const result = await useCase.execute({ brandId: 'sis', promotionId: 'inactiva' });

    expect(result.active).toBe(false);
  });

  it('refleja el paso del tiempo con el reloj inyectado', async () => {
    const { useCase, clock } = build();
    clock.set(new Date('2026-03-01T00:00:00.000Z'));

    const result = await useCase.execute({ brandId: 'sis', promotionId: 'vencida' });

    expect(result.active).toBe(true);
  });

  it('lanza PromotionNotFoundError si la promoción no existe', async () => {
    const { useCase } = build();

    await expect(
      useCase.execute({ brandId: 'sis', promotionId: 'no-existe' }),
    ).rejects.toBeInstanceOf(PromotionNotFoundError);
  });

  it('lanza BrandNotFoundError si la marca no existe', async () => {
    const { useCase } = build();

    await expect(
      useCase.execute({ brandId: 'otra', promotionId: 'con-ia' }),
    ).rejects.toBeInstanceOf(BrandNotFoundError);
  });
});
