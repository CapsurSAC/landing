/**
 * Fakes en memoria de los puertos de `application`, compartidos por las
 * pruebas unitarias y la prueba e2e. No tocan base de datos ni Redis.
 */
import { type HealthIndicator } from '@capsur/nest-kit';
import {
  type BrandRepository,
  type CatalogCache,
  type CatalogChangeNotifier,
  type Clock,
  type PromotionRecord,
  type PromotionRepository,
  type SpecialtyRepository,
} from '../../src/application/ports';
import {
  Brand,
  CampaignNotFoundError,
  Promotion,
  PromotionAlreadyExistsError,
  PromotionNotFoundError,
  type PromotionProps,
  Specialty,
  SpecialtyNotFoundError,
  type SpecialtyProps,
  type SpecialtyTrack,
} from '../../src/domain';

/** Campañas que existen en los fakes (las demás provocan CampaignNotFoundError). */
export const KNOWN_CAMPAIGNS = new Set(['especialidades-ia-2026-11']);
const FIXED_CREATED_AT = new Date('2026-11-01T00:00:00.000Z');

export const SIS_BRAND = new Brand({
  id: 'sis',
  name: 'Sistemas del Sur',
  displayName: 'IEST Privado Sistemas del Sur',
  active: true,
});

export const CAMPAIGN_START = new Date('2026-11-01T00:00:00.000Z');

export function makePromotion(overrides: Partial<PromotionProps> = {}): Promotion {
  return new Promotion({
    id: 'con-ia',
    brandId: 'sis',
    name: 'CON IA',
    headline: 'S/249',
    price: { amount: 24900, currency: 'PEN' },
    listPrice: null,
    bundle: { specialtiesIncluded: 1, allowedTracks: ['ia'], label: '1 especialidad' },
    featured: true,
    icon: 'layers',
    validFrom: CAMPAIGN_START,
    validUntil: null,
    campaignId: 'especialidades-ia-2026-11',
    sortOrder: 2,
    active: true,
    ...overrides,
  });
}

export function makeSpecialty(overrides: Partial<SpecialtyProps> = {}): Specialty {
  return new Specialty({
    id: 'desarrollo-web-con-ia',
    brandId: 'sis',
    name: 'Desarrollo Web con Inteligencia Artificial',
    shortName: null,
    track: 'ia',
    summary: 'Plataformas inteligentes con modelos de IA.',
    audience: ['desarrolladores frontend y backend'],
    modality: '100% virtual',
    endorsedBy: 'Colegio de Ingenieros del Perú',
    sortOrder: 1,
    active: true,
    ...overrides,
  });
}

export class InMemoryBrandRepository implements BrandRepository {
  calls = 0;

  constructor(private readonly brands: readonly Brand[] = [SIS_BRAND]) {}

  findActiveById(id: string): Promise<Brand | null> {
    this.calls += 1;
    return Promise.resolve(this.brands.find((brand) => brand.id === id && brand.active) ?? null);
  }
}

export class InMemoryPromotionRepository implements PromotionRepository {
  calls = 0;
  private promotions: Promotion[];
  private readonly timestamps = new Map<string, { createdAt: Date; updatedAt: Date }>();

  constructor(initial: readonly Promotion[] = []) {
    this.promotions = [...initial];
  }

  listByBrand(brandId: string): Promise<PromotionRecord[]> {
    this.calls += 1;
    return Promise.resolve(this.promotions.filter((p) => p.brandId === brandId).map((p) => this.record(p)));
  }

  create(promotion: Promotion): Promise<PromotionRecord> {
    if (this.promotions.some((p) => p.id === promotion.id)) {
      return Promise.reject(new PromotionAlreadyExistsError(promotion.id));
    }
    if (promotion.campaignId && !KNOWN_CAMPAIGNS.has(promotion.campaignId)) {
      return Promise.reject(new CampaignNotFoundError(promotion.campaignId));
    }
    this.promotions.push(promotion);
    const now = new Date();
    this.timestamps.set(promotion.id, { createdAt: now, updatedAt: now });
    return Promise.resolve(this.record(promotion));
  }

  update(promotion: Promotion): Promise<PromotionRecord> {
    const index = this.promotions.findIndex((p) => p.id === promotion.id && p.brandId === promotion.brandId);
    if (index < 0) {
      return Promise.reject(new PromotionNotFoundError(promotion.brandId, promotion.id));
    }
    this.promotions[index] = promotion;
    const createdAt = this.timestamps.get(promotion.id)?.createdAt ?? FIXED_CREATED_AT;
    this.timestamps.set(promotion.id, { createdAt, updatedAt: new Date() });
    return Promise.resolve(this.record(promotion));
  }

  private record(promotion: Promotion): PromotionRecord {
    const stamps = this.timestamps.get(promotion.id) ?? { createdAt: FIXED_CREATED_AT, updatedAt: FIXED_CREATED_AT };
    return { promotion, ...stamps };
  }

  findActiveByBrand(brandId: string): Promise<Promotion[]> {
    this.calls += 1;
    return Promise.resolve(
      this.promotions.filter((promotion) => promotion.brandId === brandId && promotion.active),
    );
  }

  findById(brandId: string, promotionId: string): Promise<Promotion | null> {
    this.calls += 1;
    return Promise.resolve(
      this.promotions.find(
        (promotion) => promotion.brandId === brandId && promotion.id === promotionId,
      ) ?? null,
    );
  }
}

export class InMemorySpecialtyRepository implements SpecialtyRepository {
  calls = 0;
  private specialties: Specialty[];

  constructor(initial: readonly Specialty[] = []) {
    this.specialties = [...initial];
  }

  listByBrand(brandId: string): Promise<Specialty[]> {
    return Promise.resolve(this.specialties.filter((specialty) => specialty.brandId === brandId));
  }

  update(specialty: Specialty): Promise<Specialty> {
    const index = this.specialties.findIndex((s) => s.id === specialty.id && s.brandId === specialty.brandId);
    if (index < 0) {
      return Promise.reject(new SpecialtyNotFoundError(specialty.brandId, specialty.id));
    }
    this.specialties[index] = specialty;
    return Promise.resolve(specialty);
  }

  findActiveByBrand(brandId: string, track?: SpecialtyTrack): Promise<Specialty[]> {
    this.calls += 1;
    return Promise.resolve(
      this.specialties
        .filter(
          (specialty) =>
            specialty.brandId === brandId &&
            specialty.active &&
            (track === undefined || specialty.track === track),
        )
        .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id)),
    );
  }
}

/** Caché en memoria que serializa en JSON igual que Redis. */
export class FakeCatalogCache implements CatalogCache {
  readonly store = new Map<string, { value: string; ttlSeconds: number }>();
  gets = 0;
  sets = 0;

  get<T>(key: string): Promise<T | null> {
    this.gets += 1;
    const entry = this.store.get(key);
    return Promise.resolve(entry ? (JSON.parse(entry.value) as T) : null);
  }

  set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.sets += 1;
    this.store.set(key, { value: JSON.stringify(value), ttlSeconds });
    return Promise.resolve();
  }

  invalidatePrefix(prefix: string): Promise<void> {
    for (const key of [...this.store.keys()]) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
    return Promise.resolve();
  }
}

/** Registra los avisos de cambio de catálogo. */
export class RecordingNotifier implements CatalogChangeNotifier {
  readonly changes: string[] = [];

  catalogChanged(brandId: string): Promise<void> {
    this.changes.push(brandId);
    return Promise.resolve();
  }
}

export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current.getTime());
  }

  set(date: Date): void {
    this.current = date;
  }
}

export class FakeHealthIndicator implements HealthIndicator {
  constructor(
    readonly name: string,
    readonly critical: boolean,
    public up: boolean,
  ) {}

  check(): Promise<boolean> {
    return Promise.resolve(this.up);
  }
}
