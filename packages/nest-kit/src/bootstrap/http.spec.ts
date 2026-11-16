import { Body, Controller, Get, Injectable, Module, Param, Post, Req, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request } from 'express';
import request from 'supertest';
import { z } from 'zod';
import type { AuditEntry } from '@capsur/api-contracts';
import { AuditModule } from '../audit/audit.module';
import type { AuditStore } from '../audit/audit.service';
import { Audited } from '../audit/audited';
import { InternalActor, InternalCaller } from '../auth/decorators';
import { InternalAuthModule } from '../auth/internal-auth.module';
import { defaultDomainErrorRegistry, mapDomainError, registerDomainErrors } from '../errors/domain-error-registry';
import { ZodValidationPipe } from '../errors/zod-validation.pipe';
import { HealthModule } from '../health/health.module';
import { createHealthIndicator, HealthService } from '../health/health.service';
import { createLoggerModule } from '../logging/logger.module';
import { bootstrapService } from './bootstrap-service';

class CatalogUnavailableError extends Error {
  readonly code = 'CATALOG_UNAVAILABLE';
  constructor(readonly retryAfterSeconds: number) {
    super('El catálogo no responde');
  }
}

const BodySchema = z.object({ name: z.string().min(2), age: z.number().int().optional() });

@Controller('api/v1/things')
class ThingsController {
  @Post()
  create(@Body(new ZodValidationPipe(BodySchema)) body: z.infer<typeof BodySchema>): { ok: true; name: string } {
    return { ok: true, name: body.name };
  }

  @Post('raw')
  raw(@Req() req: Request & { rawBody?: Buffer }): { rawLength: number } {
    return { rawLength: req.rawBody?.length ?? -1 };
  }

  @Get('catalog')
  catalog(): never {
    throw new CatalogUnavailableError(30);
  }

  @Get('throttled')
  throttled(): never {
    throw new ThrottlerException();
  }

  @Get('boom')
  boom(): never {
    throw new Error('fallo con dato +51987654321');
  }
}

@Controller('internal/admin')
class AdminController {
  @Get('whoami')
  whoami(@InternalCaller() caller: string | undefined, @InternalActor() actor: string | null): { caller?: string; actor: string | null } {
    return { caller, actor };
  }

  @Post('leads/:leadId/anonymize')
  @Audited('lead.anonymize', { target: 'leadId' })
  anonymize(@Param('leadId') leadId: string): { leadId: string } {
    return { leadId };
  }
}

@Injectable()
class MemoryAuditStore implements AuditStore {
  static readonly entries: AuditEntry[] = [];
  async record(entry: AuditEntry): Promise<void> {
    MemoryAuditStore.entries.push(entry);
  }
  async list(limit: number): Promise<AuditEntry[]> {
    return MemoryAuditStore.entries.slice(-limit).reverse();
  }
}

const TOKENS = '{"admin-web":"dev-admin-to-leads"}';

@Module({
  imports: [
    createLoggerModule({ service: 'test-service', nodeEnv: 'test' }),
    InternalAuthModule.forRoot({ tokensJson: TOKENS }),
    AuditModule.forRoot({ store: MemoryAuditStore }),
    HealthModule.forRoot({ service: 'test-service', version: '9.9.9' }),
  ],
  controllers: [ThingsController, AdminController],
})
class TestAppModule {}

async function createApp(
  env: { nodeEnv?: string; swaggerEnabled?: boolean; rawBody?: boolean } = {},
): Promise<INestApplication> {
  const app = await NestFactory.create<NestExpressApplication>(TestAppModule, {
    bufferLogs: true,
    rawBody: env.rawBody ?? false,
    logger: false,
  });
  bootstrapService(app, {
    service: 'test-service',
    version: '9.9.9',
    corsOrigins: ['http://localhost:3000'],
    swagger: { title: 'test-service', description: 'Pruebas' },
    nodeEnv: env.nodeEnv ?? 'test',
    swaggerEnabled: env.swaggerEnabled ?? false,
    contentTypeExemptPrefixes: ['/api/v1/things/raw'],
  });
  await app.init();
  return app;
}

describe('bootstrapService + ProblemDetailsFilter + InternalAuth (integración HTTP)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    registerDomainErrors([
      mapDomainError(CatalogUnavailableError, {
        status: 503,
        title: 'Catálogo no disponible',
        headers: (error) => ({ 'Retry-After': String(error.retryAfterSeconds) }),
      }),
    ]);
    app = await createApp();
    const health = app.get(HealthService);
    health.register(createHealthIndicator('database', true, () => true));
  });

  afterAll(async () => {
    await app.close();
    defaultDomainErrorRegistry.clear();
  });

  it('valida con Zod y responde 400 problem-details con errores por campo', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/things').send({ name: 'x', age: 1.5 });
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 400, code: 'VALIDATION_FAILED', title: 'Solicitud inválida' });
    expect(res.body.errors.map((e: { path: string }) => e.path).sort()).toEqual(['age', 'name']);
  });

  it('acepta JSON válido', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/things').send({ name: 'Ana' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ ok: true, name: 'Ana' });
  });

  it('propaga x-request-id como traceId y cabecera de respuesta', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/things').set('x-request-id', 'trace-123').send({});
    expect(res.headers['x-request-id']).toBe('trace-123');
    expect(res.body.traceId).toBe('trace-123');
  });

  it('415 UNSUPPORTED_MEDIA_TYPE para cuerpos no JSON', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/things').set('content-type', 'text/plain').send('hola');
    expect(res.status).toBe(415);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('las rutas exentas aceptan otros content-type', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/things/raw').set('content-type', 'text/plain').send('hola');
    expect(res.status).toBe(201);
  });

  it('413 PAYLOAD_TOO_LARGE por encima de 100 kb', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/things')
      .send({ name: 'x'.repeat(110 * 1024) });
    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
  });

  it('400 BAD_REQUEST con JSON mal formado', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/things').set('content-type', 'application/json').send('{"name":');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
  });

  it('traduce errores de dominio registrados con sus cabeceras', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/things/catalog');
    expect(res.status).toBe(503);
    expect(res.headers['retry-after']).toBe('30');
    expect(res.body).toMatchObject({ code: 'CATALOG_UNAVAILABLE', title: 'Catálogo no disponible' });
  });

  it('ThrottlerException → 429 RATE_LIMITED', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/things/throttled');
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });

  it('errores no controlados → 500 sin filtrar el mensaje interno', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/things/boom');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain('+51987654321');
  });

  it('404 en formato problem-details', async () => {
    const res = await request(app.getHttpServer()).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status: 404, code: 'NOT_FOUND' });
  });

  it('aplica helmet y no expone x-powered-by', async () => {
    const res = await request(app.getHttpServer()).get('/internal/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('/internal/health es público y devuelve el contrato', async () => {
    const res = await request(app.getHttpServer()).get('/internal/health');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toMatchObject({ status: 'ok', service: 'test-service', version: '9.9.9', checks: { database: 'up' } });
  });

  it('/internal/* exige token: 401 UNAUTHORIZED sin él', async () => {
    const res = await request(app.getHttpServer()).get('/internal/admin/whoami');
    expect(res.status).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
    expect(res.body).toMatchObject({ code: 'UNAUTHORIZED' });
    const wrong = await request(app.getHttpServer()).get('/internal/admin/whoami').set('authorization', 'Bearer otro');
    expect(wrong.status).toBe(401);
  });

  it('con token deja caller y actor', async () => {
    const res = await request(app.getHttpServer())
      .get('/internal/admin/whoami')
      .set('authorization', 'Bearer dev-admin-to-leads')
      .set('x-actor', 'asesora@capsur.pe');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ caller: 'admin-web', actor: 'asesora@capsur.pe' });
  });

  it('@Audited registra caller, actor, ruta y params al completar', async () => {
    const leadId = '0b6f9a54-6d1c-4b55-9a59-0b8ef3e2f001';
    const res = await request(app.getHttpServer())
      .post(`/internal/admin/leads/${leadId}/anonymize`)
      .set('authorization', 'Bearer dev-admin-to-leads')
      .set('x-actor', 'asesora@capsur.pe');
    expect(res.status).toBe(201);
    const entry = MemoryAuditStore.entries.at(-1);
    expect(entry).toMatchObject({
      caller: 'admin-web',
      actor: 'asesora@capsur.pe',
      action: 'lead.anonymize',
      target: leadId,
      metadata: { method: 'POST', route: '/internal/admin/leads/:leadId/anonymize', params: { leadId }, status: 201 },
    });
    expect(entry?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('fuera de producción Swagger está activo y no exige token', async () => {
    const res = await request(app.getHttpServer()).get('/internal/docs-json');
    expect(res.status).toBe(200);
    expect(res.body.info.title).toBe('test-service');
  });
});

describe('Swagger en producción (C14) y rawBody', () => {
  it('sin SWAGGER_ENABLED no existe', async () => {
    const app = await createApp({ nodeEnv: 'production' });
    try {
      const res = await request(app.getHttpServer()).get('/internal/docs-json').set('authorization', 'Bearer dev-admin-to-leads');
      expect(res.status).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('con SWAGGER_ENABLED exige token', async () => {
    const app = await createApp({ nodeEnv: 'production', swaggerEnabled: true });
    try {
      const anonymous = await request(app.getHttpServer()).get('/internal/docs-json');
      expect(anonymous.status).toBe(401);
      expect(anonymous.body.code).toBe('UNAUTHORIZED');
      const ui = await request(app.getHttpServer()).get('/internal/docs');
      expect(ui.status).toBe(401);
      const authorized = await request(app.getHttpServer()).get('/internal/docs-json').set('authorization', 'Bearer dev-admin-to-leads');
      expect(authorized.status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('respeta rawBody: true con el límite JSON propio', async () => {
    const app = await createApp({ rawBody: true });
    try {
      const res = await request(app.getHttpServer()).post('/api/v1/things/raw').send({ a: 1 });
      expect(res.status).toBe(201);
      expect(res.body.rawLength).toBe(Buffer.byteLength('{"a":1}'));
    } finally {
      await app.close();
    }
  });
});
