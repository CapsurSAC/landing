import { type AdminPromotionInput, AdminPromotionInputSchema } from '@capsur/api-contracts';
import {
  InMemoryBrandRepository,
  InMemoryPromotionRepository,
  makePromotion,
  RecordingNotifier,
} from '../../../test/support/fakes';
import {
  BrandNotFoundError,
  CampaignNotFoundError,
  InvalidCatalogDataError,
  PromotionAlreadyExistsError,
  PromotionNotFoundError,
} from '../../domain';
import { ManagePromotions } from './manage-promotions';

function input(overrides: Partial<AdminPromotionInput> = {}): AdminPromotionInput {
  return AdminPromotionInputSchema.parse({
    id: 'pack-full',
    brand: 'sis',
    name: 'PACK FULL',
    headline: 'S/599',
    price: { amount: 59900, currency: 'PEN' },
    bundle: { specialtiesIncluded: 3, allowedTracks: ['ia', 'tradicional'], label: '3 especialidades' },
    validFrom: '2026-11-01T00:00:00.000Z',
    validUntil: null,
    campaignId: 'especialidades-ia-2026-11',
    ...overrides,
  });
}

function build() {
  const promotions = new InMemoryPromotionRepository([makePromotion({ id: 'con-ia' })]);
  const notifier = new RecordingNotifier();
  const useCase = new ManagePromotions({ brands: new InMemoryBrandRepository(), promotions, notifier });
  return { useCase, notifier };
}

describe('ManagePromotions', () => {
  it('crea una promoción válida y avisa del cambio de catálogo', async () => {
    const { useCase, notifier } = build();
    const created = await useCase.create(input());
    expect(created).toMatchObject({ id: 'pack-full', active: true, price: { amount: 59900, currency: 'PEN' } });
    expect(notifier.changes).toEqual(['sis']);
  });

  it('lista también las promociones inactivas', async () => {
    const { useCase } = build();
    await useCase.create(input({ active: false }));
    const items = await useCase.list('sis');
    expect(items.map((p) => [p.id, p.active])).toEqual([
      ['con-ia', true],
      ['pack-full', false],
    ]);
  });

  it('no avisa si la operación falla', async () => {
    const { useCase, notifier } = build();
    await expect(useCase.create(input({ id: 'con-ia' }))).rejects.toBeInstanceOf(PromotionAlreadyExistsError);
    await expect(useCase.create(input({ campaignId: 'no-existe' }))).rejects.toBeInstanceOf(CampaignNotFoundError);
    expect(notifier.changes).toEqual([]);
  });

  it.each([
    ['validUntil', { validUntil: '2026-10-01T00:00:00.000Z' }],
    ['listPrice', { listPrice: { amount: 1000, currency: 'PEN' as const } }],
    ['bundle.allowedTracks', { bundle: { specialtiesIncluded: 1, allowedTracks: ['ia', 'ia'] as const, label: 'x' } }],
  ])('aplica las reglas de negocio (%s)', async (path, overrides) => {
    const { useCase } = build();
    const error = await useCase.create(input(overrides as Partial<AdminPromotionInput>)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidCatalogDataError);
    expect((error as InvalidCatalogDataError).path).toBe(path);
  });

  it('exige que el id de la ruta coincida con el del cuerpo', async () => {
    const { useCase } = build();
    await expect(useCase.update('con-ia', input())).rejects.toMatchObject({ path: 'id' });
  });

  it('actualiza y desactiva promociones existentes', async () => {
    const { useCase, notifier } = build();
    const updated = await useCase.update('con-ia', input({ id: 'con-ia', headline: 'S/229' }));
    expect(updated.headline).toBe('S/229');
    const deactivated = await useCase.deactivate('sis', 'con-ia');
    expect(deactivated.active).toBe(false);
    expect(notifier.changes).toEqual(['sis', 'sis']);
  });

  it('responde con errores de dominio claros', async () => {
    const { useCase } = build();
    await expect(useCase.deactivate('sis', 'no-existe')).rejects.toBeInstanceOf(PromotionNotFoundError);
    await expect(useCase.list('otra')).rejects.toBeInstanceOf(BrandNotFoundError);
  });
});
