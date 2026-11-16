import { makePromotion } from '../../test/support/fakes';

describe('Promotion.isAvailableAt', () => {
  const validFrom = new Date('2026-11-01T00:00:00.000Z');
  const validUntil = new Date('2026-12-01T00:00:00.000Z');

  it('es vigente dentro del intervalo [validFrom, validUntil)', () => {
    const promotion = makePromotion({ validFrom, validUntil });

    expect(promotion.isAvailableAt(validFrom)).toBe(true);
    expect(promotion.isAvailableAt(new Date('2026-11-15T00:00:00.000Z'))).toBe(true);
    expect(promotion.isAvailableAt(validUntil)).toBe(false);
    expect(promotion.isAvailableAt(new Date('2026-10-31T23:59:59.999Z'))).toBe(false);
  });

  it('sin validUntil es vigente indefinidamente desde validFrom', () => {
    const promotion = makePromotion({ validFrom, validUntil: null });

    expect(promotion.isAvailableAt(new Date('2099-01-01T00:00:00.000Z'))).toBe(true);
  });

  it('nunca es vigente si está desactivada', () => {
    const promotion = makePromotion({ validFrom, validUntil: null, active: false });

    expect(promotion.isAvailableAt(new Date('2026-11-15T00:00:00.000Z'))).toBe(false);
  });
});
