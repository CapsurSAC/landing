# @capsur/nest-kit

Piezas transversales para los microservicios NestJS de la plataforma de captación (promotions, leads, crm-bridge). **Sin lógica de negocio.** CommonJS compilado con `tsc` a `dist/`.

```bash
pnpm --filter @capsur/nest-kit build      # dist/
pnpm --filter @capsur/nest-kit test       # Jest + @swc/jest (Redis/RabbitMQ reales si están en localhost)
```

Puntos de entrada:

| Import | Contenido |
| --- | --- |
| `@capsur/nest-kit` | Todo lo descrito abajo |
| `@capsur/nest-kit/sentry` | Solo Sentry (`initSentry`, `scrubSentryEvent`): no importa Nest, para llamarlo antes de crear la app |

## Esqueleto de un servicio

```ts
// src/instrument.ts — primera importación de main.ts
import { initSentry } from '@capsur/nest-kit/sentry';
initSentry({ service: 'leads-service', release: SERVICE_VERSION }); // SENTRY_DSN vacío = desactivado

// src/main.ts
import './instrument';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { bootstrapService } from '@capsur/nest-kit';

const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
const listen = bootstrapService(app, {
  service: 'leads-service',
  version: SERVICE_VERSION,
  corsOrigins: env.CORS_ORIGINS,
  swagger: { title: 'leads-service', description: 'Leads de GRUPO CAPSUR' },
});
await listen(env.PORT); // 0.0.0.0

// src/app.module.ts
@Module({
  imports: [
    createLoggerModule({ service: 'leads-service', level: env.LOG_LEVEL }),
    InternalAuthModule.forRoot({ tokensJson: env.INTERNAL_API_TOKENS }),
    AuditModule.forRoot({ imports: [PrismaModule], store: PrismaAuditStore }),
    HealthModule.forRoot({ service: 'leads-service', version: SERVICE_VERSION, imports: [PrismaModule], indicators: [PrismaHealthIndicator] }),
    RabbitMqModule.forRoot({ url: env.RABBITMQ_URL, connectionName: 'leads-service' }),
  ],
})
export class AppModule {}
```

## 1. Validación y errores (B4)

- `ZodValidationPipe(schema)`: valida y transforma; si falla lanza `ValidationException` → 400 `VALIDATION_FAILED` con `errors: [{ path, message }]`.
- `ProblemException({ status, title, code, detail?, errors?, headers? })`: cualquier error HTTP con forma problem-details (p. ej. `Retry-After`).
- `ProblemDetailsFilter` (lo registra `bootstrapService`): responde `application/problem+json` con `traceId` = id de la petición. Traduce `ThrottlerException` → 429 `RATE_LIMITED`, cuerpo grande → 413 `PAYLOAD_TOO_LARGE`, 415 `UNSUPPORTED_MEDIA_TYPE`, JSON mal formado → 400, y cualquier otro error → 500 `INTERNAL_ERROR` (logueado sin cuerpo ni query, reportado a Sentry).
- Errores de dominio → status/código con `registerDomainErrors` (gana la clase más específica):

```ts
@Post()
create(@Body(new ZodValidationPipe(CreateLeadRequestSchema)) body: CreateLeadRequest) {}

registerDomainErrors([
  mapDomainError(LeadNotFoundError, { status: 404, title: 'Solicitud no encontrada' }),
  mapDomainError(CatalogUnavailableError, {
    status: 503,
    title: 'Catálogo no disponible',
    headers: (e) => ({ 'Retry-After': String(e.retryAfterSeconds) }),
  }),
  mapDomainError(InvalidPhoneNumberError, { status: 400, errors: (e) => [{ path: e.path, message: e.message }] }),
]);
```

Por defecto `code` = propiedad `code` del error y `detail` = `error.message` (en 5xx no se expone). También puede inyectarse un `DomainErrorRegistry` propio con el token `DOMAIN_ERROR_REGISTRY`.

## 2. Logging (B21, C26)

`createLoggerModule({ service, level? })` configura nestjs-pino:

- `x-request-id` entrante válido se respeta; si no, UUID. Siempre se devuelve en la respuesta.
- Redacción común `REDACT_PATHS`: `authorization`, `cookie`, `x-lead-token`, `api_access_token`, `x-api-key`, `req.body.consumer`, `req.body.captchaToken` y `fullName`, `phone`, `phoneE164`, `email`, `phone_number`, `documentNumber` hasta 4 niveles de profundidad.
- Producción: JSON con `pino.destination({ sync: false })`. Desarrollo: `pino-pretty` en un worker. `NODE_ENV=test`: `silent`.
- Sin log automático de `/internal/health`.

```ts
// Bien: el teléfono va como campo y pino lo redacta.
this.logger.info({ leadId, phone: lead.phone }, 'Lead duplicado');
// Mal (lo prohíbe la regla de ESLint): `Lead ${lead.phone} duplicado`
```

`redactDeep(obj)` y `scrubText(text)` aplican la misma política fuera de pino.

## 3. Bootstrap (C12, C14, C23)

`bootstrapService(app, options)` devuelve `listen(port)` y aplica: logger de pino, helmet, CORS (`corsOrigins` vacío = desactivado), `trust proxy` 1, sin `x-powered-by`, JSON con límite `jsonLimit` (100 kb; respeta `rawBody: true` de `NestFactory.create`), 415 para POST/PUT/PATCH con cuerpo no JSON (salvo `contentTypeExemptPrefixes`), `ProblemDetailsFilter` global, `enableShutdownHooks` y Swagger en `/internal/docs` + `/internal/docs-json` solo si `NODE_ENV !== 'production'` o `SWAGGER_ENABLED=true`; en producción exige el mismo token interno.

```ts
// crm-bridge: rawBody para la firma del webhook y webhook exento del 415
const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bufferLogs: true });
const listen = bootstrapService(app, {
  service: 'crm-bridge-service',
  version,
  corsOrigins: [],
  contentTypeExemptPrefixes: ['/webhooks/'],
  swagger: { title: 'crm-bridge-service', description: 'Puente con Chatwoot', document: (a) => buildOpenApi(a) },
});
```

## 4. Autenticación entre servicios y auditoría (C4, C24)

- `InternalAuthModule.forRoot({ tokensJson })` (o `forRootAsync`): parsea `INTERNAL_API_TOKENS` y registra un guard global que exige `Authorization: Bearer <token>` en todo `/internal/*` (comparación en tiempo constante sobre SHA-256). Falla → 401 `UNAUTHORIZED`. Deja `request.caller` y `request.actor` (`x-actor`).
- `@Public()` exime una ruta (el health ya lo está). `@UseGuards(InternalAuthGuard)` protege rutas fuera de `/internal/`.
- `@InternalCaller()` / `@InternalActor()` leen llamador y actor.
- `AuditModule.forRoot({ store })` + `@Audited('accion', { target: 'leadId' })`: al completar registra caller, actor, método, ruta, params y status (nunca el cuerpo) en el log (`audit: true`) y en el `AuditStore` del servicio.

```ts
@Injectable()
export class PrismaAuditStore implements AuditStore {
  constructor(private readonly prisma: PrismaService) {}
  async record(entry: AuditEntry) { await this.prisma.auditLog.create({ data: { ...entry, at: new Date(entry.at) } }); }
  async list(limit: number) { /* select … orderBy at desc take limit */ }
}

@Controller('internal/admin')
export class AdminLeadsController {
  constructor(private readonly audit: AuditService) {}

  @Post('leads/:leadId/anonymize')
  @Audited('lead.anonymize', { target: 'leadId' })
  anonymize(@Param('leadId') leadId: string, @InternalActor() actor: string | null) {}

  @Get('audit')
  list(@Query('limit') limit?: string) { return this.audit.list(Number(limit ?? 50)); }
}
```

## 5. Health (B19)

`HealthModule.forRoot({ service, version, indicators?, extras?, imports? })` expone `GET /internal/health` (público, sin rate limit, `Cache-Control: no-store`) con `{ status, service, version, checks, timestamp, ...extras }`. Caché de 5 s, timeout de 1,5 s por chequeo. Dependencia crítica caída → `down` + 503; no crítica → `degraded` + 200.

```ts
@Injectable()
export class PrismaHealthIndicator implements HealthIndicator {
  readonly name = 'database';
  readonly critical = true;
  constructor(private readonly prisma: PrismaService) {}
  async check() { await this.prisma.$queryRaw`SELECT 1`; return true; }
}

// También en tiempo de ejecución:
health.register(rabbitMqHealthIndicator(connection));             // 'rabbitmq', no crítico
health.register(createHealthIndicator('redis', false, async () => (await redis.ping()) === 'PONG'));

// Campos extra (leads: outbox)
@Injectable()
export class OutboxHealthExtras implements HealthExtras {
  async collect({ checks }) { return { outbox: checks.database === 'up' ? await this.outbox.counts() : null }; }
}
```

## 6. Rate limiting distribuido (C2)

`RedisThrottlerStorage` implementa `ThrottlerStorage` de `@nestjs/throttler` 6 con un script Lua atómico (INCR + PEXPIRE + bloqueo con `blockDuration`). Si Redis falla o tarda más de 500 ms usa memoria local y avisa con `warn` (máx. uno cada 30 s): nunca rechaza por un error de Redis. `RedisRateLimiter.consume(key, limit, windowMs)` aplica límites por clave de negocio.

```ts
const redis = env.REDIS_URL ? createRedisClient(env.REDIS_URL) : null;

ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 10 }], storage: new RedisThrottlerStorage(redis) });

const limiter = new RedisRateLimiter(redis);
const decision = await limiter.consume(`phone:${phoneHash}`, 5, 60 * 60 * 1000);
if (!decision.allowed) {
  throw new ProblemException({
    status: 429, title: 'Demasiadas solicitudes', code: 'RATE_LIMITED',
    headers: { 'Retry-After': String(Math.ceil(decision.retryAfterMs / 1000)) },
  });
}
```

## 7. Datos personales (C8)

```ts
const cipher = new PiiCipher(env.PII_ENCRYPTION_KEY);   // 32 bytes en base64, si no lanza un error claro
const stored = cipher.encrypt('+51987654321');          // v1.<iv>.<tag>.<ct> (base64url, IV aleatorio)
cipher.decrypt(stored);                                 // PiiDecryptionError si se manipuló
cipher.encryptJson(payload); cipher.decryptJson<Payload>(stored);

const phoneHash = hmacHash('+51987654321', env.PII_HASH_KEY); // HMAC-SHA256 hex; clave ≥ 32 bytes
const ipHash = hashIp(request.ip, env.IP_HASH_PEPPER);         // sha256(ip + pepper), compatible con leads-service
```

## 8. RabbitMQ (B5, B20)

`RabbitMqModule.forRoot({ url, connectionName })` aporta `RabbitMqConnection` (reconexión exponencial 1 s → 30 s, no bloquea el arranque) y `RabbitMqPublisher` (`EVENT_PUBLISHER`). Nunca declara colas ni exchanges (solo `checkQueue`): funciona con usuarios sin permiso `configure`.

```ts
await publisher.publish(buildEnvelope(EventNames.LeadCreated, payload, { producer: 'leads-service', correlationId: payload.leadId }));
await publisher.publishRaw(EXCHANGE_DLX, message.fields.routingKey, message.content, { persistent: true, headers });

@Injectable()
export class LeadFeedbackConsumer implements OnModuleInit {
  constructor(private readonly connection: RabbitMqConnection) {}
  onModuleInit() {
    this.connection.createConsumer({
      queue: Queues.CrmBridgeLeadFeedback,
      prefetch: 5,
      handler: async (message, controls) => {
        // Sin ack/nack explícito: ack al terminar; si lanza: nack(requeue=false).
        if (!valid) return controls.ack();
        await this.useCase.execute(parse(message));
      },
    });
  }
}

const { messageCount, consumerCount } = await connection.queueStats(Queues.CrmBridgeLeadCreatedDlq);
```

Apagado ordenado (con `enableShutdownHooks`): `beforeApplicationShutdown` cancela los consumidores y espera sus mensajes en vuelo (máx. 10 s); `onApplicationShutdown` cierra canales y conexión. Sin conexión, `publish` lanza `BrokerUnavailableError` (reintentable); un nack del broker, `PublishFailedError`.

## 9. Sentry (C23)

`initSentry({ service, release })` antes de crear la app (ver esqueleto). Desactivado si `SENTRY_DSN` está vacío. Recolección mínima (`dataCollection` sin cuerpos, cookies, query ni usuario) y `beforeSend = scrubSentryEvent`: elimina `request.data`, cookies, query string y cabeceras sensibles, deja del usuario solo el `id`, redacta campos personales en `extra`/`contexts`/`tags`/breadcrumbs y sustituye correos y teléfonos en mensajes. Los 5xx del `ProblemDetailsFilter` se reportan solos.

## 10. Turnstile (C3)

```ts
const turnstile = new TurnstileVerifier({ secret: env.TURNSTILE_SECRET_KEY }); // vacío → 'skipped'
const result = await turnstile.verify(body.captchaToken, request.ip);       // 'ok' | 'invalid' | 'unavailable' | 'skipped'
await turnstile.verifyOrThrow(body.captchaToken, request.ip);               // 400 CAPTCHA_INVALID / 503 CAPTCHA_UNAVAILABLE
```

Timeout de 3 s; error de red, 5xx o `internal-error` de Cloudflare → `unavailable`.

## 11. Seguridad de URLs (C20)

```ts
assertAllowedUrl(env.CHATWOOT_BASE_URL, env.CHATWOOT_BASE_URL_ALLOWLIST, { requireHttps: env.NODE_ENV === 'production' });
```

Entradas `host`, `host:puerto` o `*.dominio`; lista vacía no permite nada; rechaza esquemas no http(s) y URLs con credenciales. Lanza `UrlNotAllowedError`.

## Pruebas

`pnpm --filter @capsur/nest-kit test`. Las suites de Redis (`REDIS_TEST_URL`, por defecto `redis://localhost:6379`) y RabbitMQ (`RABBITMQ_ADMIN_TEST_URL` / `RABBITMQ_SERVICE_TEST_URL`, por defecto `capsur` y `leads_svc` en `localhost:5672`) se omiten (`describe.skip`) si no hay conexión. La de RabbitMQ crea una cola temporal `leads.nest-kit-test-*` enlazada a `capsur.events` y la borra al terminar.
