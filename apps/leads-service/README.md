# leads-service

Registro transaccional de solicitudes de información (leads) de la plataforma de captación de GRUPO CAPSUR. Primera marca: IEST Privado Sistemas del Sur (`sis`).

Responsabilidades:

- Validar en servidor el formulario de la landing (`CreateLeadRequestSchema` de `@capsur/api-contracts`), normalizar el teléfono a E.164 y validar la promoción contra `promotions-service` (nunca se aceptan precios del navegador).
- Controlar duplicados (misma marca, teléfono y promoción en 24 h) e idempotencia por cabecera `Idempotency-Key`.
- Guardar el historial de consentimiento y la procedencia (UTM, referrer, fbclid, gclid).
- Publicar `lead.created.v1` en RabbitMQ con el patrón **Transactional Outbox** (el evento se escribe en la misma transacción que el lead y un relay lo publica después).
- Consumir los eventos `crm.*` que emite `crm-bridge-service` para actualizar el estado del lead de forma idempotente.
- Recibir eventos de tracking autorizados (sin datos personales).

Base de datos propia (`leads`), Prisma, NestJS 11, pino, RabbitMQ (`amqplib`), Redis (`ioredis`, opcional).

## Arquitectura

```
src/
├── config/          # EnvSchema (Zod) + AppConfigModule (token ENV)
├── domain/          # Lead (máquina de estados), PhoneNumber, LeadReference, errores. Sin Nest ni Prisma
├── application/
│   ├── ports/       # LeadRepository, SubmissionRepository, OutboxRepository, TrackingRepository,
│   │                # PromotionCatalog, EventPublisher, IdempotencyCache, ProcessedEventRepository, Clock, AppLogger
│   ├── use-cases/   # CreateLead, GetLeadStatus, RecordTrackingEvent, ApplyCrmStatusEvent, RelayOutbox
│   └── support/     # huella de la solicitud, hash de IP, constructor de la respuesta
├── infrastructure/  # Prisma (repositorios), HttpPromotionCatalog, RabbitMqConnection/Publisher,
│                    # RedisIdempotencyCache / NullIdempotencyCache, SystemClock, PinoAppLogger, sondas de salud
├── presentation/
│   ├── http/        # LeadsController, TrackingController, HealthController, ZodValidationPipe, ProblemDetailsFilter
│   ├── consumers/   # CrmStatusConsumer (cola leads.crm-status)
│   └── workers/     # OutboxRelay (setInterval sobre RelayOutbox)
├── use-cases.module.ts  # cableado de los casos de uso con useFactory sobre los puertos
├── app.module.ts / app.setup.ts / main.ts
prisma/
├── schema.prisma    # generator output = ./generated/client
└── migrations/      # 20261113204722_init
test/
├── support/         # fakes en memoria y entorno de pruebas
└── http.e2e-spec.ts # e2e con supertest sobre la app real con fakes
```

Regla de dependencia: `presentation → application → domain`; `infrastructure` implementa los puertos y se enlaza con tokens (`Symbol`).

## Flujo de `POST /api/v1/leads`

1. **Honeypot**: si el cuerpo trae `website` no vacío → `204 No Content`, no se persiste nada y se registra un `warn` sin datos personales (antes de la validación).
2. **`Idempotency-Key`** obligatoria (8-128 caracteres). Si falta → `400 IDEMPOTENCY_KEY_REQUIRED`.
3. **Validación** con `CreateLeadRequestSchema` → `400 VALIDATION_FAILED` con `errors: [{ path, message }]` (mensajes del contrato).
4. **Idempotencia**: se calcula la huella `sha256` del cuerpo normalizado. Si la clave ya existe con la misma huella → `200` con el snapshot guardado, `replayed: true` y cabecera `Idempotent-Replayed: true`. Si existe con otra huella → `422 IDEMPOTENCY_KEY_REUSED`. Redis actúa como caché de lectura (TTL 24 h); la base de datos es la fuente de verdad y si Redis falla se consulta la BD.
5. **Teléfono**: `libphonenumber-js` con `phoneCountry` (por defecto `PE`); debe ser válido y, para Perú, móvil de 9 dígitos que empieza por 9. Inválido → `400 INVALID_PHONE` con error en `path: "phone"`.
6. **Promoción**: `GET {PROMOTIONS_SERVICE_URL}/internal/promotions/{id}/validate?brand={brand}` (timeout 2 s, caché en memoria 60 s por promoción, respuesta validada con `PromotionValidationSchema`). `404` o `active: false` → `422 PROMOTION_NOT_AVAILABLE`. Catálogo inalcanzable y sin caché → `503 CATALOG_UNAVAILABLE` con `Retry-After: 5` (si hay una respuesta previa caducada, hasta 10 min, se usa como respaldo).
7. **Duplicados**: lead de la misma marca, `phoneE164` y `promotionId` en las últimas 24 h → no se crea otro; se registra una `lead_submission` con `outcome: DUPLICATE` y se responde `200` con los datos del lead existente (`replayed: false`).
8. **Creación** en una única transacción Prisma: `leads` (referencia `SIS-XXXXX` generada con `crypto.randomInt` sobre `REFERENCE_ALPHABET`, hasta 5 reintentos ante colisión), `consent_records`, `lead_attributions` (si viene), `lead_submissions` (`CREATED`, con el snapshot de la respuesta) y `outbox_events` (`lead.created.v1`, `PENDING`). Respuesta `201` con `CreateLeadResponse` y `whatsapp.url` construida con `buildWhatsAppMessage` (primer nombre + `BRAND_DISPLAY_NAME`) y `buildWhatsAppUrl(WHATSAPP_NUMBER, mensaje)`.

La IP solo se almacena como `sha256(ip + IP_HASH_PEPPER)`. Detrás del gateway se respeta `X-Forwarded-For` (`trust proxy = 1`).

## Outbox relay y consumidor

- **`OutboxRelay`** (worker) ejecuta `RelayOutbox` cada `OUTBOX_POLL_INTERVAL_MS` con una bandera que evita solapes. Cada pasada reclama hasta 50 eventos `PENDING` con `nextAttemptAt <= now()` mediante `SELECT ... FOR UPDATE SKIP LOCKED` dentro de una transacción (y adelanta `nextAttemptAt` 60 s como reserva para otras instancias), los publica uno a uno con canal de confirmaciones y:
  - éxito → `PUBLISHED`, `publishedAt`, y el lead pasa de `REGISTERED` a `CRM_SYNCING`;
  - fallo → `attempts + 1`, `nextAttemptAt = now + min(2^attempts, 300) s`, `lastError`; tras 10 intentos → `FAILED`.
- **`RabbitMqPublisher`**: `publish(capsur.events, routingKey = envelope.name, JSON, { persistent, contentType: application/json, messageId: envelope.id, correlationId, timestamp, type, appId })` y espera la confirmación del broker. Exchanges y colas los declaran las definiciones del broker; el servicio solo hace `checkExchange` / `checkQueue`.
- **`RabbitMqConnection`**: conexión perezosa con reconexión exponencial (1 s → 30 s). Si RabbitMQ no está disponible al arrancar, el servicio sigue sirviendo HTTP: los leads se guardan y el outbox reintenta; el health reporta `rabbitmq: down` y `status: degraded`.
- **`CrmStatusConsumer`** consume `leads.crm-status` (prefetch 10). Valida el sobre con `EventEnvelopeSchema`; si `processed_events` ya tiene el `id` → `ack`. Eventos:
  - `crm.contact.synced.v1` → `CRM_SYNCED`, `crmContactId`, `crmSyncedAt`;
  - `crm.conversation.linked.v1` → `crmConversationId`, `crmConversationLinkedAt` (implica `CRM_SYNCED` si llegó desordenado);
  - `crm.sync.failed.v1` → `CRM_FAILED`.

  La actualización del lead y la inserción en `processed_events` van en una transacción; después se hace `ack`. Payload o sobre inválidos → log `error` + `ack` (reintentar basura no la arregla). Lead inexistente o transición no permitida → se ignora, se registra el id y se hace `ack`.

  **Decisión sobre errores de infraestructura** (por ejemplo, base de datos caída): `nack(msg, false, true)` tras una pausa de 1 s. La cola `leads.crm-status` no tiene DLX ni cola de reintento en `infrastructure/rabbitmq/definitions.json`, así que `requeue=false` descartaría el evento definitivamente; la pausa evita un bucle caliente mientras la dependencia se recupera. Si en el futuro se añade una cola de reintento con TTL para esta cola, cambiar a `requeue=false` siguiendo la convención general.

Máquina de estados del lead: `REGISTERED → CRM_SYNCING | CRM_SYNCED | CRM_FAILED`, `CRM_SYNCING → CRM_SYNCED | CRM_FAILED`, `CRM_FAILED → CRM_SYNCING | CRM_SYNCED`, `CRM_SYNCED` terminal.

## Endpoints

| Método | Ruta | Descripción | Respuestas |
| --- | --- | --- | --- |
| `POST` | `/api/v1/leads` | Registra un lead | `201` creado · `200` replay (`Idempotent-Replayed: true`) o duplicado · `204` honeypot · `400` · `422` · `429` · `503` |
| `GET` | `/api/v1/leads/:leadId/status` | Estado del lead sin datos personales (`Cache-Control: no-store`) | `200` `LeadStatusResponse` · `400 INVALID_LEAD_ID` · `404 LEAD_NOT_FOUND` |
| `POST` | `/api/v1/tracking/events` | Evento de tracking autorizado (`TrackingEventRequestSchema`) | `202 { accepted: true }` · `400` · `429` |
| `GET` | `/internal/health` | `{ status, service, version, checks: { database, rabbitmq, redis }, outbox: { pending, failed }, timestamp }` | `200` (`ok` / `degraded`) · `503` (`down`, BD inaccesible) |
| `GET` | `/internal/docs` | Swagger UI (`/internal/docs-json` para el documento OpenAPI) | `200` |

`checks.redis` solo aparece cuando `REDIS_URL` está configurada.

### Cabeceras

| Cabecera | Dirección | Uso |
| --- | --- | --- |
| `Idempotency-Key` | petición | Obligatoria en `POST /api/v1/leads` (8-128 caracteres, una por envío del formulario). |
| `Idempotent-Replayed: true` | respuesta | El `Idempotency-Key` ya se había procesado; se devolvió la respuesta previa. |
| `Retry-After` | respuesta | En `503 CATALOG_UNAVAILABLE` (5 s) y en `429 RATE_LIMITED`. |
| `X-Request-Id` | ambas | Se acepta del gateway o se genera; viaja en los logs y como `traceId` en los errores. |
| `X-Forwarded-For` | petición | IP real del cliente detrás del gateway (rate limit y hash de IP). |
| `Cache-Control: no-store` | respuesta | En el estado del lead y en el health. |

### Errores (problem-details, `application/problem+json`)

```json
{ "type": "about:blank", "title": "...", "status": 400, "detail": "...", "code": "...", "errors": [{ "path": "phone", "message": "..." }], "traceId": "..." }
```

| `status` | `code` | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | El cuerpo no cumple el contrato (`errors` por campo). |
| 400 | `INVALID_PHONE` | Teléfono inválido (`errors[0].path = "phone"`). |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | Falta la cabecera o tiene longitud inválida. |
| 400 | `INVALID_LEAD_ID` | `leadId` no es UUID. |
| 404 | `LEAD_NOT_FOUND` | El lead no existe. |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Misma clave con un cuerpo distinto. |
| 422 | `PROMOTION_NOT_AVAILABLE` | Promoción inexistente, de otra marca o inactiva. |
| 429 | `RATE_LIMITED` | `LEADS_RATE_LIMIT_PER_MINUTE` por IP en leads; 60/min en tracking. |
| 503 | `CATALOG_UNAVAILABLE` | `promotions-service` no responde y no hay caché (`Retry-After: 5`). |
| 500 | `INTERNAL_ERROR` | Error no controlado (se registra con `traceId`). |

## Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `PORT` | no (3002) | Puerto HTTP. |
| `NODE_ENV` | no | `development` activa `pino-pretty`. |
| `LOG_LEVEL` | no (`info`) | Nivel de pino. |
| `DATABASE_URL` | sí | PostgreSQL del servicio (`leads`). |
| `REDIS_URL` | no | Caché de idempotencia. Sin ella se usa `NullIdempotencyCache` (solo BD). |
| `RABBITMQ_URL` | sí | Broker (`amqp://capsur:capsur@localhost:5672`). |
| `PROMOTIONS_SERVICE_URL` | sí | Base URL de `promotions-service`. |
| `WHATSAPP_NUMBER` | sí | Número de captación en E.164 sin `+`. |
| `BRAND_DISPLAY_NAME` | no (`Sistemas del Sur`) | Nombre de marca en el mensaje de WhatsApp. |
| `REFERENCE_PREFIX` | no (`SIS`) | Prefijo de la referencia corta (2-5 mayúsculas). |
| `OUTBOX_POLL_INTERVAL_MS` | no (2000) | Intervalo del relay de outbox. |
| `LEADS_RATE_LIMIT_PER_MINUTE` | no (10) | Límite por IP y minuto en `POST /api/v1/leads`. |
| `IP_HASH_PEPPER` | sí | Pimienta (≥ 16 caracteres) para el hash de IP. Cambiar en producción. |
| `CORS_ORIGINS` | no | Orígenes permitidos separados por coma. |

Los logs redactan `req.headers.authorization`, `req.headers.cookie`, `req.body.fullName`, `req.body.phone` y `req.body.email`.

## Cómo correr

```bash
# Desde la raíz del monorepo (dependencias ya instaladas con pnpm install)
pnpm infra:up                                        # postgres, redis, rabbitmq
cp apps/leads-service/.env.example apps/leads-service/.env
pnpm --filter @capsur/leads-service db:generate      # cliente Prisma en prisma/generated/client
pnpm --filter @capsur/leads-service db:migrate:dev   # aplica migraciones (desarrollo)
pnpm --filter @capsur/leads-service dev              # nest start --watch
# o
pnpm --filter @capsur/leads-service build && pnpm --filter @capsur/leads-service start
```

Comprobaciones:

```bash
pnpm --filter @capsur/leads-service typecheck
pnpm --filter @capsur/leads-service lint
pnpm --filter @capsur/leads-service test        # unitarias (fakes en memoria) + e2e HTTP con supertest
```

Prueba manual:

```bash
curl -s http://localhost:3002/internal/health
curl -s -X POST http://localhost:3002/api/v1/leads \
  -H 'Content-Type: application/json' -H 'Idempotency-Key: form-0001-abcdef' \
  -d '{"brand":"sis","promotionId":"con-ia","fullName":"Ana Quispe","phone":"987 654 321","email":"ana@example.com","consent":{"contactAccepted":true,"marketingAccepted":false,"privacyVersion":"2026-11"}}'
```

Si `promotions-service` no está corriendo, la respuesta esperada es `503 CATALOG_UNAVAILABLE` con `Retry-After: 5`.

En contenedor (`apps/leads-service/Dockerfile`) se ejecuta `prisma migrate deploy` antes de `node dist/main.js`.

## Modelo de datos

`leads`, `lead_submissions` (una fila por solicitud recibida, incluidas las duplicadas), `consent_records`, `lead_attributions`, `outbox_events`, `tracking_events`, `processed_events`. Ver `prisma/schema.prisma`.

Nota: `lead_submissions.idempotencyKey` es única, por lo que un replay (misma clave, misma huella) no inserta una fila nueva; se devuelve el `responseSnapshot` de la fila original. El valor `REPLAYED` del enum queda reservado para un registro de auditoría futuro sin la restricción de unicidad.

## Pruebas

- `CreateLead`: camino feliz (outbox + URL de WhatsApp), replay por `Idempotency-Key`, clave reutilizada → 422, duplicado en 24 h, promoción inactiva, catálogo caído, teléfono inválido, colisión de referencia, Redis caído.
- `PhoneNumber`: `987 654 321` → `+51987654321`; `+54 9 11 2345 6789` (AR); rechazos.
- `LeadReference`: formato y alfabeto.
- `RelayOutbox`: publica y marca `PUBLISHED`; backoff y `FAILED` tras 10 intentos.
- `ApplyCrmStatusEvent`: idempotencia por id de evento, los tres eventos, payload inválido, lead inexistente.
- e2e HTTP: honeypot, cabecera obligatoria, validación, replay, 422, 503 con `Retry-After`, estado, tracking, health, OpenAPI.
