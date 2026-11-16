/**
 * Prueba e2e del transporte HTTP: arranca el AppModule real con el bootstrap
 * del kit (logger, filtro problem-details, límites, 415, auth interna,
 * auditoría, salud) sustituyendo los adaptadores de infraestructura por fakes
 * en memoria. No requiere PostgreSQL ni Redis.
 */
import './support/env';
import { AdminPromotionSchema, PromotionsResponseSchema, SpecialtiesResponseSchema } from '@capsur/api-contracts';
import { AUDIT_STORE, type AuditStore, bootstrapService, HealthService } from '@capsur/nest-kit';
import { type INestApplication } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  BRAND_REPOSITORY,
  CATALOG_CACHE,
  CATALOG_CHANGE_NOTIFIER,
  CLOCK,
  NullCatalogCache,
  PROMOTION_REPOSITORY,
  SPECIALTY_REPOSITORY,
} from '../src/application/ports';
import { PrismaAuditStore } from '../src/infrastructure/prisma/prisma-audit.store';
import { PrismaHealthIndicator } from '../src/infrastructure/prisma/prisma-health.indicator';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import {
  FakeHealthIndicator,
  FixedClock,
  InMemoryBrandRepository,
  InMemoryPromotionRepository,
  InMemorySpecialtyRepository,
  makePromotion,
  makeSpecialty,
  RecordingNotifier,
} from './support/fakes';

const NOW = new Date('2026-11-15T12:00:00.000Z');
const ADMIN = { Authorization: 'Bearer test-admin-token-123456', 'x-actor': 'ana@capsur.pe' };
const LEADS = { Authorization: 'Bearer test-leads-token-123456' };

/** Auditoría en memoria con la misma interfaz que la de Prisma. */
class MemoryAuditStore implements AuditStore {
  readonly entries: Parameters<AuditStore['record']>[0][] = [];
  record(entry: Parameters<AuditStore['record']>[0]): Promise<void> {
    this.entries.unshift(entry);
    return Promise.resolve();
  }
  list(limit: number) {
    return Promise.resolve(this.entries.slice(0, limit));
  }
}

const validInput = {
  id: 'pack-full',
  brand: 'sis',
  name: 'PACK FULL',
  headline: 'S/599',
  price: { amount: 59900, currency: 'PEN' },
  bundle: { specialtiesIncluded: 3, allowedTracks: ['ia', 'tradicional'], label: '3 especialidades' },
  featured: false,
  icon: 'stack',
  validFrom: '2026-11-01T00:00:00.000Z',
  validUntil: '2026-12-31T23:59:59.000Z',
  campaignId: 'especialidades-ia-2026-11',
  sortOrder: 4,
  active: true,
};

describe('promotions-service HTTP (e2e)', () => {
  let app: INestApplication;
  let health: HealthService;
  const database = new FakeHealthIndicator('database', true, true);
  const redis = new FakeHealthIndicator('redis', false, true);
  const notifier = new RecordingNotifier();
  const audit = new MemoryAuditStore();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(PrismaHealthIndicator)
      .useValue(database)
      .overrideProvider(PrismaAuditStore)
      .useValue(audit)
      .overrideProvider(AUDIT_STORE)
      .useValue(audit)
      .overrideProvider(BRAND_REPOSITORY)
      .useValue(new InMemoryBrandRepository())
      .overrideProvider(PROMOTION_REPOSITORY)
      .useValue(
        new InMemoryPromotionRepository([
          makePromotion({ id: 'con-ia', sortOrder: 2 }),
          makePromotion({
            id: 'dos-por-uno',
            sortOrder: 1,
            icon: 'gift',
            bundle: { specialtiesIncluded: 2, allowedTracks: ['ia', 'tradicional'], label: 'IA + tradicional' },
          }),
          makePromotion({ id: 'vencida', validUntil: new Date('2026-11-10T00:00:00.000Z') }),
        ]),
      )
      .overrideProvider(SPECIALTY_REPOSITORY)
      .useValue(
        new InMemorySpecialtyRepository([
          makeSpecialty({ id: 'desarrollo-web-con-ia', track: 'ia' }),
          makeSpecialty({ id: 'computacion-e-informatica', track: 'tradicional', sortOrder: 9 }),
        ]),
      )
      .overrideProvider(CATALOG_CACHE)
      .useValue(new NullCatalogCache())
      .overrideProvider(CATALOG_CHANGE_NOTIFIER)
      .useValue(notifier)
      .overrideProvider(CLOCK)
      .useValue(new FixedClock(NOW))
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    bootstrapService(app as NestExpressApplication, { service: 'promotions-service', version: 'test', corsOrigins: [] });
    await app.init();
    health = app.get(HealthService);
    health.register(redis);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('catálogo público', () => {
    it('GET /api/v1/promotions devuelve el contrato con cabecera de caché', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/promotions').expect(200);

      expect(response.headers['cache-control']).toBe('public, max-age=60, stale-while-revalidate=300');
      expect(response.headers['x-request-id']).toBeDefined();
      const body = PromotionsResponseSchema.parse(response.body);
      expect(body.brand).toBe('sis');
      expect(body.items.map((item) => item.id)).toEqual(['dos-por-uno', 'con-ia']);
    });

    it('responde 304 si el catálogo no cambió (ETag, B9)', async () => {
      const first = await request(app.getHttpServer()).get('/api/v1/promotions').expect(200);
      const etag = first.headers.etag;
      expect(etag).toBeDefined();
      await request(app.getHttpServer()).get('/api/v1/promotions').set('If-None-Match', etag as string).expect(304);
    });

    it('propaga el x-request-id entrante', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/promotions')
        .set('x-request-id', 'trace-abc-123')
        .expect(200);
      expect(response.headers['x-request-id']).toBe('trace-abc-123');
    });

    it('marca inexistente → 404 problem-details con traceId', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/promotions?brand=otra')
        .set('x-request-id', 'trace-404')
        .expect(404);

      expect(response.headers['content-type']).toContain('application/problem+json');
      expect(response.body).toMatchObject({ status: 404, code: 'BRAND_NOT_FOUND', traceId: 'trace-404' });
    });

    it('marca con formato inválido → 400 con errores por campo', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/promotions?brand=NO!VALIDO').expect(400);
      expect(response.body).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' });
      expect(response.body.errors).toEqual([{ path: 'brand', message: expect.any(String) }]);
    });

    it('GET /api/v1/specialties filtra por track', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/specialties?track=tradicional').expect(200);
      const body = SpecialtiesResponseSchema.parse(response.body);
      expect(body.items.map((item) => item.id)).toEqual(['computacion-e-informatica']);
    });
  });

  describe('autenticación interna (C4)', () => {
    it('rechaza /internal/* sin token o con token inválido', async () => {
      await request(app.getHttpServer()).get('/internal/promotions/con-ia/validate').expect(401);
      const bad = await request(app.getHttpServer())
        .get('/internal/admin/promotions')
        .set('Authorization', 'Bearer otro-token-cualquiera')
        .expect(401);
      expect(bad.body.code).toBe('UNAUTHORIZED');
    });

    it('el health sigue siendo público', async () => {
      await request(app.getHttpServer()).get('/internal/health').expect(200);
    });
  });

  describe('validación para leads-service', () => {
    it('devuelve vigencia y especialidades elegibles según el bundle (A3)', async () => {
      const vigente = await request(app.getHttpServer())
        .get('/internal/promotions/dos-por-uno/validate')
        .set(LEADS)
        .expect(200);
      expect(vigente.body).toMatchObject({ id: 'dos-por-uno', active: true, specialtiesIncluded: 2 });
      expect(vigente.body.allowedSpecialties.map((s: { id: string }) => s.id)).toEqual([
        'desarrollo-web-con-ia',
        'computacion-e-informatica',
      ]);

      const soloIa = await request(app.getHttpServer()).get('/internal/promotions/con-ia/validate').set(LEADS).expect(200);
      expect(soloIa.body.allowedSpecialties.map((s: { id: string }) => s.id)).toEqual(['desarrollo-web-con-ia']);

      const vencida = await request(app.getHttpServer())
        .get('/internal/promotions/vencida/validate?brand=sis')
        .set(LEADS)
        .expect(200);
      expect(vencida.body.active).toBe(false);

      const inexistente = await request(app.getHttpServer())
        .get('/internal/promotions/no-existe/validate')
        .set(LEADS)
        .expect(404);
      expect(inexistente.body.code).toBe('PROMOTION_NOT_FOUND');
    });
  });

  describe('administración (A1, C24)', () => {
    it('crea, edita y desactiva una promoción; avisa del cambio y audita', async () => {
      const created = await request(app.getHttpServer())
        .post('/internal/admin/promotions')
        .set(ADMIN)
        .send(validInput)
        .expect(201);
      expect(AdminPromotionSchema.parse(created.body)).toMatchObject({ id: 'pack-full', active: true });

      const updated = await request(app.getHttpServer())
        .put('/internal/admin/promotions/pack-full')
        .set(ADMIN)
        .send({ ...validInput, headline: 'S/579', price: { amount: 57900, currency: 'PEN' } })
        .expect(200);
      expect(updated.body.headline).toBe('S/579');

      const deactivated = await request(app.getHttpServer())
        .post('/internal/admin/promotions/pack-full/deactivate')
        .set(ADMIN)
        .expect(200);
      expect(deactivated.body.active).toBe(false);

      expect(notifier.changes).toEqual(['sis', 'sis', 'sis']);

      const list = await request(app.getHttpServer()).get('/internal/admin/promotions').set(ADMIN).expect(200);
      expect(list.body.items.find((p: { id: string }) => p.id === 'pack-full').active).toBe(false);

      const auditLog = await request(app.getHttpServer()).get('/internal/admin/audit?limit=10').set(ADMIN).expect(200);
      expect(auditLog.body.items.slice(0, 3)).toEqual([
        expect.objectContaining({ action: 'promotion.deactivate', target: 'pack-full', caller: 'admin-web', actor: 'ana@capsur.pe' }),
        expect.objectContaining({ action: 'promotion.update', target: 'pack-full' }),
        expect.objectContaining({ action: 'promotion.create', target: 'pack-full' }),
      ]);
    });

    it('rechaza duplicados, campañas inexistentes y reglas de negocio', async () => {
      const duplicate = await request(app.getHttpServer())
        .post('/internal/admin/promotions')
        .set(ADMIN)
        .send({ ...validInput, id: 'con-ia' })
        .expect(409);
      expect(duplicate.body.code).toBe('PROMOTION_ALREADY_EXISTS');

      const campaign = await request(app.getHttpServer())
        .post('/internal/admin/promotions')
        .set(ADMIN)
        .send({ ...validInput, id: 'otra-promo', campaignId: 'no-existe' })
        .expect(400);
      expect(campaign.body.errors).toEqual([{ path: 'campaignId', message: expect.any(String) }]);

      const dates = await request(app.getHttpServer())
        .post('/internal/admin/promotions')
        .set(ADMIN)
        .send({ ...validInput, id: 'fechas-malas', validUntil: '2026-10-01T00:00:00.000Z' })
        .expect(400);
      expect(dates.body.errors).toEqual([{ path: 'validUntil', message: expect.any(String) }]);

      const mismatch = await request(app.getHttpServer())
        .put('/internal/admin/promotions/con-ia')
        .set(ADMIN)
        .send(validInput)
        .expect(400);
      expect(mismatch.body.errors[0].path).toBe('id');
    });

    it('rechaza cuerpos no JSON (415) y demasiado grandes (413)', async () => {
      await request(app.getHttpServer())
        .post('/internal/admin/promotions')
        .set(ADMIN)
        .set('content-type', 'text/plain')
        .send('hola')
        .expect(415);

      await request(app.getHttpServer())
        .post('/internal/admin/promotions')
        .set(ADMIN)
        .send({ ...validInput, name: 'x'.repeat(150_000) })
        .expect(413);
    });
  });

  it('GET /internal/health refleja el estado de las dependencias', async () => {
    const ok = await request(app.getHttpServer()).get('/internal/health').expect(200);
    expect(ok.body).toMatchObject({
      status: 'ok',
      service: 'promotions-service',
      checks: { database: 'up', redis: 'up' },
    });

    redis.up = false;
    health.register(redis); // registrar de nuevo limpia la caché de 5 s del kit
    const degraded = await request(app.getHttpServer()).get('/internal/health').expect(200);
    expect(degraded.body).toMatchObject({ status: 'degraded', checks: { redis: 'down' } });

    database.up = false;
    health.register(redis);
    const down = await request(app.getHttpServer()).get('/internal/health').expect(503);
    expect(down.body.status).toBe('down');

    database.up = true;
    redis.up = true;
  });
});
