import { SpecialtiesResponseSchema } from '@capsur/api-contracts';
import {
  FakeCatalogCache,
  InMemoryBrandRepository,
  InMemorySpecialtyRepository,
  makeSpecialty,
} from '../../../test/support/fakes';
import { BrandNotFoundError } from '../../domain';
import { ListSpecialties } from './list-specialties';

function build() {
  const brands = new InMemoryBrandRepository();
  const specialties = new InMemorySpecialtyRepository([
    makeSpecialty({ id: 'ciberseguridad-4-0', track: 'ia', sortOrder: 2 }),
    makeSpecialty({ id: 'desarrollo-web-con-ia', track: 'ia', sortOrder: 1 }),
    makeSpecialty({
      id: 'computacion-e-informatica',
      track: 'tradicional',
      sortOrder: 3,
      shortName: 'Computación e Informática',
    }),
    makeSpecialty({ id: 'inactiva', track: 'ia', sortOrder: 0, active: false }),
  ]);
  const cache = new FakeCatalogCache();
  const useCase = new ListSpecialties({ brands, specialties, cache, cacheTtlSeconds: 60 });
  return { useCase, brands, specialties, cache };
}

describe('ListSpecialties', () => {
  it('lista las especialidades activas de la marca ordenadas por sortOrder', async () => {
    const { useCase } = build();

    const response = await useCase.execute({ brandId: 'sis' });

    expect(response.items.map((item) => item.id)).toEqual([
      'desarrollo-web-con-ia',
      'ciberseguridad-4-0',
      'computacion-e-informatica',
    ]);
    expect(() => SpecialtiesResponseSchema.parse(response)).not.toThrow();
  });

  it('filtra por línea formativa', async () => {
    const { useCase } = build();

    const response = await useCase.execute({ brandId: 'sis', track: 'tradicional' });

    expect(response.items.map((item) => item.id)).toEqual(['computacion-e-informatica']);
    expect(response.items[0]?.shortName).toBe('Computación e Informática');
  });

  it('usa claves de caché distintas por línea', async () => {
    const { useCase, specialties, cache } = build();

    await useCase.execute({ brandId: 'sis', track: 'ia' });
    await useCase.execute({ brandId: 'sis', track: 'tradicional' });
    await useCase.execute({ brandId: 'sis', track: 'ia' });

    expect(specialties.calls).toBe(2);
    expect(cache.store.size).toBe(2);
  });

  it('lanza BrandNotFoundError si la marca no existe', async () => {
    const { useCase } = build();

    await expect(useCase.execute({ brandId: 'nope' })).rejects.toBeInstanceOf(BrandNotFoundError);
  });
});
