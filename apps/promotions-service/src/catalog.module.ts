import { HealthService } from '@capsur/nest-kit';
import { Inject, Module, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BRAND_REPOSITORY,
  type BrandRepository,
  CATALOG_CACHE,
  CATALOG_CHANGE_NOTIFIER,
  type CatalogCache,
  type CatalogChangeNotifier,
  CLOCK,
  type Clock,
  NullCatalogCache,
  PROMOTION_REPOSITORY,
  type PromotionRepository,
  SPECIALTY_REPOSITORY,
  type SpecialtyRepository,
} from './application/ports';
import { ListActivePromotions } from './application/use-cases/list-active-promotions';
import { ListSpecialties } from './application/use-cases/list-specialties';
import { ManagePromotions } from './application/use-cases/manage-promotions';
import { ManageSpecialties } from './application/use-cases/manage-specialties';
import { ValidatePromotion } from './application/use-cases/validate-promotion';
import { type Env } from './config/env';
import { RedisCatalogCache } from './infrastructure/cache/redis-catalog-cache';
import { SystemClock } from './infrastructure/clock/system-clock';
import { HttpCatalogChangeNotifier } from './infrastructure/notifications/catalog-change-notifier';
import { PrismaBrandRepository } from './infrastructure/prisma/prisma-brand.repository';
import { PrismaPromotionRepository } from './infrastructure/prisma/prisma-promotion.repository';
import { PrismaSpecialtyRepository } from './infrastructure/prisma/prisma-specialty.repository';
import { PrismaService } from './infrastructure/prisma/prisma.service';
import { AdminCatalogController } from './presentation/http/admin-catalog.controller';
import { InternalPromotionsController } from './presentation/http/internal-promotions.controller';
import { PromotionsController } from './presentation/http/promotions.controller';
import { SpecialtiesController } from './presentation/http/specialties.controller';

type AppConfig = ConfigService<Env, true>;

/**
 * Módulo del catálogo: enlaza los puertos de `application` con sus
 * adaptadores de `infrastructure` y expone los controladores HTTP.
 */
@Module({
  controllers: [PromotionsController, SpecialtiesController, InternalPromotionsController, AdminCatalogController],
  providers: [
    { provide: CLOCK, useFactory: (): Clock => new SystemClock() },
    {
      provide: BRAND_REPOSITORY,
      useFactory: (prisma: PrismaService): BrandRepository => new PrismaBrandRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: SPECIALTY_REPOSITORY,
      useFactory: (prisma: PrismaService): SpecialtyRepository => new PrismaSpecialtyRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: PROMOTION_REPOSITORY,
      useFactory: (prisma: PrismaService): PromotionRepository => new PrismaPromotionRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: CATALOG_CACHE,
      useFactory: (config: AppConfig): CatalogCache => {
        const redisUrl = config.get('REDIS_URL', { infer: true });
        return redisUrl ? new RedisCatalogCache(redisUrl) : new NullCatalogCache();
      },
      inject: [ConfigService],
    },
    {
      provide: CATALOG_CHANGE_NOTIFIER,
      useFactory: (cache: CatalogCache, config: AppConfig): CatalogChangeNotifier =>
        new HttpCatalogChangeNotifier(cache, {
          url: config.get('WEB_REVALIDATE_URL', { infer: true }),
          secret: config.get('WEB_REVALIDATE_SECRET', { infer: true }),
        }),
      inject: [CATALOG_CACHE, ConfigService],
    },
    {
      provide: ListActivePromotions,
      useFactory: (
        brands: BrandRepository,
        promotions: PromotionRepository,
        cache: CatalogCache,
        clock: Clock,
        config: AppConfig,
      ): ListActivePromotions =>
        new ListActivePromotions({
          brands,
          promotions,
          cache,
          clock,
          cacheTtlSeconds: config.get('CATALOG_CACHE_TTL_SECONDS', { infer: true }),
        }),
      inject: [BRAND_REPOSITORY, PROMOTION_REPOSITORY, CATALOG_CACHE, CLOCK, ConfigService],
    },
    {
      provide: ListSpecialties,
      useFactory: (
        brands: BrandRepository,
        specialties: SpecialtyRepository,
        cache: CatalogCache,
        config: AppConfig,
      ): ListSpecialties =>
        new ListSpecialties({
          brands,
          specialties,
          cache,
          cacheTtlSeconds: config.get('CATALOG_CACHE_TTL_SECONDS', { infer: true }),
        }),
      inject: [BRAND_REPOSITORY, SPECIALTY_REPOSITORY, CATALOG_CACHE, ConfigService],
    },
    {
      provide: ValidatePromotion,
      useFactory: (
        brands: BrandRepository,
        promotions: PromotionRepository,
        specialties: SpecialtyRepository,
        clock: Clock,
      ): ValidatePromotion => new ValidatePromotion({ brands, promotions, specialties, clock }),
      inject: [BRAND_REPOSITORY, PROMOTION_REPOSITORY, SPECIALTY_REPOSITORY, CLOCK],
    },
    {
      provide: ManagePromotions,
      useFactory: (
        brands: BrandRepository,
        promotions: PromotionRepository,
        notifier: CatalogChangeNotifier,
      ): ManagePromotions => new ManagePromotions({ brands, promotions, notifier }),
      inject: [BRAND_REPOSITORY, PROMOTION_REPOSITORY, CATALOG_CHANGE_NOTIFIER],
    },
    {
      provide: ManageSpecialties,
      useFactory: (
        brands: BrandRepository,
        specialties: SpecialtyRepository,
        notifier: CatalogChangeNotifier,
      ): ManageSpecialties => new ManageSpecialties({ brands, specialties, notifier }),
      inject: [BRAND_REPOSITORY, SPECIALTY_REPOSITORY, CATALOG_CHANGE_NOTIFIER],
    },
  ],
})
export class CatalogModule implements OnModuleInit, OnApplicationShutdown {
  constructor(
    @Inject(CATALOG_CACHE) private readonly cache: CatalogCache,
    @Inject(HealthService) private readonly health: HealthService,
  ) {}

  onModuleInit(): void {
    // Redis es opcional: si cae, el catálogo se sirve sin caché (degraded, no down).
    if (this.cache instanceof RedisCatalogCache) {
      this.cache.warmUp();
      this.health.register(this.cache);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (this.cache instanceof RedisCatalogCache) {
      await this.cache.close();
    }
  }
}
