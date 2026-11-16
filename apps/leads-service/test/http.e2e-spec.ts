import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { CLOCK } from '../src/application/ports/clock';
import { EVENT_PUBLISHER } from '../src/application/ports/event-publisher';
import { IDEMPOTENCY_CACHE } from '../src/application/ports/idempotency-cache';
import { LEAD_REPOSITORY } from '../src/application/ports/lead-repository';
import { OUTBOX_REPOSITORY } from '../src/application/ports/outbox-repository';
import { PROCESSED_EVENT_REPOSITORY } from '../src/application/ports/processed-event-repository';
import { PROMOTION_CATALOG } from '../src/application/ports/promotion-catalog';
import { SUBMISSION_REPOSITORY } from '../src/application/ports/submission-repository';
import { TRACKING_REPOSITORY } from '../src/application/ports/tracking-repository';
import { RabbitMqConnection } from '../src/infrastructure/messaging/rabbitmq-connection';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import {
  ACTIVE_PROMOTION,
  FakeEventPublisher,
  FakeIdempotencyCache,
  FakePromotionCatalog,
  FixedClock,
  INACTIVE_PROMOTION,
  InMemoryLeadRepository,
  InMemoryOutboxRepository,
  InMemoryProcessedEventRepository,
  InMemoryStore,
  InMemorySubmissionRepository,
  InMemoryTrackingRepository,
} from './support/fakes';

const VALID_BODY = {
  brand: 'sis',
  promotionId: 'con-ia',
  fullName: 'Ana María Quispe',
  phone: '987 654 321',
  phoneCountry: 'PE',
  email: 'ana@example.com',
  consent: { contactAccepted: true, marketingAccepted: false, privacyVersion: '2026-11' },
  attribution: { utmSource: 'meta' },
};

describe('HTTP (e2e con fakes en memoria)', () => {
  let app: NestExpressApplication;
  let store: InMemoryStore;
  let catalog: FakePromotionCatalog;

  beforeAll(async () => {
    store = new InMemoryStore();
    catalog = new FakePromotionCatalog([ACTIVE_PROMOTION, INACTIVE_PROMOTION]);

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ ping: async () => true })
      .overrideProvider(RabbitMqConnection)
      .useValue({
        isConnected: () => false,
        onConnected: () => () => undefined,
        ensureConnected: () => undefined,
        getConnection: async () => {
          throw new Error('RabbitMQ no disponible en pruebas');
        },
      })
      .overrideProvider(LEAD_REPOSITORY)
      .useValue(new InMemoryLeadRepository(store))
      .overrideProvider(SUBMISSION_REPOSITORY)
      .useValue(new InMemorySubmissionRepository(store))
      .overrideProvider(OUTBOX_REPOSITORY)
      .useValue(new InMemoryOutboxRepository(store))
      .overrideProvider(PROCESSED_EVENT_REPOSITORY)
      .useValue(new InMemoryProcessedEventRepository(store))
      .overrideProvider(TRACKING_REPOSITORY)
      .useValue(new InMemoryTrackingRepository(store))
      .overrideProvider(PROMOTION_CATALOG)
      .useValue(catalog)
      .overrideProvider(IDEMPOTENCY_CACHE)
      .useValue(new FakeIdempotencyCache())
      .overrideProvider(EVENT_PUBLISHER)
      .useValue(new FakeEventPublisher())
      .overrideProvider(CLOCK)
      .useValue(new FixedClock(new Date('2026-11-13T15:00:00.000Z')))
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/v1/leads', () => {
    it('responde 204 sin persistir cuando el honeypot viene relleno', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/leads')
        .send({ ...VALID_BODY, website: 'http://spam.example' })
        .expect(204);
      expect(store.leads.size).toBe(0);
    });

    it('exige la cabecera Idempotency-Key', async () => {
      const res = await request(app.getHttpServer()).post('/api/v1/leads').send(VALID_BODY).expect(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
      expect(res.body).toMatchObject({ status: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' });
      expect(typeof res.body.traceId).toBe('string');
    });

    it('devuelve 400 con errores por campo cuando el cuerpo es inválido', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/leads')
        .set('Idempotency-Key', 'form-invalid-0001')
        .send({ ...VALID_BODY, fullName: 'A', email: 'no-es-correo', consent: { contactAccepted: false, privacyVersion: '1' } })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      const paths = (res.body.errors as Array<{ path: string; message: string }>).map((e) => e.path);
      expect(paths).toEqual(expect.arrayContaining(['fullName', 'email', 'consent.contactAccepted']));
      expect(res.body.errors).toEqual(
        expect.arrayContaining([{ path: 'email', message: 'Escribe un correo válido' }]),
      );
    });

    it('devuelve 400 en phone cuando el teléfono no es un móvil peruano', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/leads')
        .set('Idempotency-Key', 'form-phone-0001')
        .send({ ...VALID_BODY, phone: '12345678' })
        .expect(400);
      expect(res.body).toMatchObject({
        code: 'INVALID_PHONE',
        errors: [{ path: 'phone', message: 'Escribe un número de WhatsApp válido (en Perú son 9 dígitos y empieza con 9)' }],
      });
    });

    it('crea el lead (201) y lo reproduce con la misma clave (200 + Idempotent-Replayed)', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/v1/leads')
        .set('Idempotency-Key', 'form-happy-0001')
        .set('X-Forwarded-For', '203.0.113.7')
        .send(VALID_BODY)
        .expect(201);
      expect(created.body).toMatchObject({ status: 'registered', phone: '+51987654321', replayed: false });
      expect(created.body.whatsapp.url).toContain('https://wa.me/51987654321?text=');
      expect(store.submissions.at(-1)?.ipHash).toHaveLength(64);

      const replayed = await request(app.getHttpServer())
        .post('/api/v1/leads')
        .set('Idempotency-Key', 'form-happy-0001')
        .send(VALID_BODY)
        .expect(200);
      expect(replayed.headers['idempotent-replayed']).toBe('true');
      expect(replayed.body).toMatchObject({ leadId: created.body.leadId, replayed: true });
    });

    it('rechaza con 422 la misma clave con otro cuerpo', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/leads')
        .set('Idempotency-Key', 'form-happy-0001')
        .send({ ...VALID_BODY, fullName: 'Otra Persona' })
        .expect(422);
      expect(res.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('devuelve 422 PROMOTION_NOT_AVAILABLE para una promoción inactiva', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/leads')
        .set('Idempotency-Key', 'form-inactive-0001')
        .send({ ...VALID_BODY, promotionId: 'tradicional' })
        .expect(422);
      expect(res.body).toMatchObject({ code: 'PROMOTION_NOT_AVAILABLE', detail: 'Esta promoción ya no está disponible. Elige otra.' });
    });

    it('devuelve 503 CATALOG_UNAVAILABLE con Retry-After cuando el catálogo no responde', async () => {
      catalog.unavailable = true;
      try {
        const res = await request(app.getHttpServer())
          .post('/api/v1/leads')
          .set('Idempotency-Key', 'form-catalog-0001')
          .send({ ...VALID_BODY, phone: '911111111' })
          .expect(503);
        expect(res.body.code).toBe('CATALOG_UNAVAILABLE');
        expect(res.headers['retry-after']).toBe('5');
      } finally {
        catalog.unavailable = false;
      }
    });
  });

  describe('GET /api/v1/leads/:leadId/status', () => {
    it('valida el uuid', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/leads/abc/status').expect(400);
      expect(res.body.code).toBe('INVALID_LEAD_ID');
    });

    it('devuelve 404 si no existe', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/leads/00000000-0000-4000-8000-000000000000/status')
        .expect(404);
      expect(res.body.code).toBe('LEAD_NOT_FOUND');
    });

    it('devuelve el estado sin datos personales y con Cache-Control: no-store', async () => {
      const [lead] = [...store.leads.values()];
      const res = await request(app.getHttpServer()).get(`/api/v1/leads/${lead!.id}/status`).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toEqual({
        leadId: lead!.id,
        reference: lead!.reference,
        status: 'registered',
        crm: { syncedAt: null, conversationLinked: false },
        updatedAt: lead!.updatedAt.toISOString(),
      });
      expect(JSON.stringify(res.body)).not.toContain('987654321');
    });
  });

  describe('POST /api/v1/tracking/events', () => {
    it('acepta un evento válido con 202', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tracking/events')
        .send({ brand: 'sis', event: 'landing_viewed', sessionId: 'session-12345678', promotionId: 'con-ia' })
        .expect(202);
      expect(res.body).toEqual({ accepted: true });
      expect(store.tracking).toHaveLength(1);
    });

    it('rechaza eventos no autorizados', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tracking/events')
        .send({ brand: 'sis', event: 'typed_password', sessionId: 'session-12345678' })
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('internal', () => {
    it('GET /internal/health reporta degraded cuando RabbitMQ no está', async () => {
      const res = await request(app.getHttpServer()).get('/internal/health').expect(200);
      expect(res.body).toMatchObject({
        status: 'degraded',
        service: 'leads-service',
        checks: { database: 'up', rabbitmq: 'down' },
        outbox: { pending: expect.any(Number), failed: 0 },
      });
      expect(typeof res.body.timestamp).toBe('string');
    });

    it('GET /internal/docs-json expone el documento OpenAPI', async () => {
      const res = await request(app.getHttpServer()).get('/internal/docs-json').expect(200);
      expect(Object.keys(res.body.paths)).toEqual(
        expect.arrayContaining(['/api/v1/leads', '/api/v1/leads/{leadId}/status', '/api/v1/tracking/events', '/internal/health']),
      );
    });
  });
});
