import { PromotionsResponseSchema } from '@capsur/api-contracts';
import {
  FakeCatalogCache,
  FixedClock,
  InMemoryBrandRepository,
  InMemoryPromotionRepository,
  makePromotion,
} from '../../../test/support/fakes';
import { BrandNotFoundError } from '../../domain';
import { ListActivePromotions, promotionsCacheKey } from './list-active-promotions';

const NOW = new Date('2026-11-15T12:00:00.000Z');

function build(promotions = defaultPromotions(), cacheTtlSeconds = 60) {
  const brands = new InMemoryBrandRepository();
  const repository = new InMemoryPromotionRepository(promotions);
  const cache = new FakeCatalogCache();
  const clock = new FixedClock(NOW);
  const useCase = new ListActivePromotions({
    brands,
    promotions: repository,
    cache,
    clock,
    cacheTtlSeconds,
  });
  return { useCase, brands, repository, cache, clock };
}

function defaultPromotions() {
  return [
    makePromotion({ id: 'pack-ia-pro', name: 'PACK IA PRO', sortOrder: 3, icon: 'stack' }),
    makePromotion({ id: 'con-ia', name: 'CON IA', sortOrder: 2 }),
    makePromotion({ id: 'dos-por-uno', name: '2×1', sortOrder: 1, icon: 'gift' }),
    // Vencida: terminó antes de NOW.
    makePromotion({
      id: 'vencida',
      sortOrder: 0,
      validFrom: new Date('2026-01-01T00:00:00.000Z'),
      validUntil: new Date('2026-06-01T00:00:00.000Z'),
    }),
    // Futura: todavía no empieza.
    makePromotion({ id: 'futura', sortOrder: 0, validFrom: new Date('2027-01-01T00:00:00.000Z') }),
    // Desactivada manualmente.
    makePromotion({ id: 'inactiva', sortOrder: 0, active: false }),
  ];
}

describe('ListActivePromotions', () => {
  it('devuelve solo las promociones vigentes en la fecha del reloj, ordenadas por sortOrder', async () => {
    const { useCase } = build();

    const response = await useCase.execute({ brandId: 'sis' });

    expect(response.brand).toBe('sis');
    expect(response.items.map((item) => item.id)).toEqual(['dos-por-uno', 'con-ia', 'pack-ia-pro']);
    expect(response.generatedAt).toBe(NOW.toISOString());
  });

  it('trata validUntil como límite exclusivo', async () => {
    const promotions = [
      makePromotion({ id: 'termina-ahora', validUntil: NOW }),
      makePromotion({ id: 'termina-luego', validUntil: new Date(NOW.getTime() + 1) }),
    ];
    const { useCase } = build(promotions);

    const response = await useCase.execute({ brandId: 'sis' });

    expect(response.items.map((item) => item.id)).toEqual(['termina-luego']);
  });

  it('produce una respuesta válida según el contrato público', async () => {
    const { useCase } = build();

    const response = await useCase.execute({ brandId: 'sis' });

    expect(() => PromotionsResponseSchema.parse(response)).not.toThrow();
  });

  it('lanza BrandNotFoundError si la marca no existe', async () => {
    const { useCase } = build();

    await expect(useCase.execute({ brandId: 'otra' })).rejects.toBeInstanceOf(BrandNotFoundError);
  });

  it('sirve la segunda llamada desde la caché sin tocar los repositorios', async () => {
    const { useCase, brands, repository, cache } = build();

    const first = await useCase.execute({ brandId: 'sis' });
    const second = await useCase.execute({ brandId: 'sis' });

    expect(second).toEqual(first);
    expect(brands.calls).toBe(1);
    expect(repository.calls).toBe(1);
    expect(cache.sets).toBe(1);
    expect(cache.store.get(promotionsCacheKey('sis'))?.ttlSeconds).toBe(60);
  });

  it('no escribe en caché cuando el TTL es 0', async () => {
    const { useCase, repository, cache } = build(defaultPromotions(), 0);

    await useCase.execute({ brandId: 'sis' });
    await useCase.execute({ brandId: 'sis' });

    expect(cache.sets).toBe(0);
    expect(repository.calls).toBe(2);
  });
});
