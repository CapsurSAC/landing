# Especificación de integración v2 (implementación de las 90 mejoras)

Documento de coordinación. Todas las piezas deben respetar estos nombres, rutas, variables y formatos. Las propuestas originales están en `docs/backlog/propuestas-mejora.md` (A = producto, B = optimización, C = seguridad). Los contratos están en `packages/api-contracts/src` (ya actualizados: `leads.ts`, `compliance.ts`, `admin.ts`, `events.ts`, `security.ts`).

## 1. Puertos locales

| App | Puerto |
| --- | --- |
| web-sis | 3000 |
| promotions-service | 3001 |
| leads-service | 3002 |
| crm-bridge-service | 3003 |
| admin-web | 3004 |
| gateway (Traefik) | 8080 |

## 2. Autenticación entre servicios (C4, C24)

- Cabecera `Authorization: Bearer <token>`. Cada servicio lee `INTERNAL_API_TOKENS`, un JSON `{ "<caller>": "<token>" }`. El guard de `@capsur/nest-kit` identifica al llamador por su token (comparación en tiempo constante) y lo deja en `request.caller`.
- Cabecera opcional `x-actor` (correo del usuario del panel) para auditoría (`ACTOR_HEADER` en contratos).
- Todas las rutas `/internal/*` exigen token, **excepto** `GET /internal/health` (lo usa el orquestador; el gateway nunca expone `/internal/*`).
- Swagger (`/internal/docs`, `/internal/docs-json`): desactivado si `NODE_ENV=production` salvo `SWAGGER_ENABLED=true`, y aun así exige token (C14).

Valores de desarrollo (`.env.example`):

| Servicio | `INTERNAL_API_TOKENS` |
| --- | --- |
| promotions-service | `{"admin-web":"dev-admin-to-promotions","leads-service":"dev-leads-to-promotions"}` |
| leads-service | `{"admin-web":"dev-admin-to-leads"}` |
| crm-bridge-service | `{"admin-web":"dev-admin-to-crm","ops":"dev-ops-to-crm"}` |

Llamadores: leads-service usa `PROMOTIONS_SERVICE_TOKEN=dev-leads-to-promotions`. admin-web usa `PROMOTIONS_SERVICE_TOKEN=dev-admin-to-promotions`, `LEADS_SERVICE_TOKEN=dev-admin-to-leads`, `CRM_BRIDGE_SERVICE_TOKEN=dev-admin-to-crm`. La antigua `INTERNAL_API_TOKEN` de crm-bridge desaparece (la reemplaza el llamador `ops`).

Auditoría: cada acción `/internal/admin/*` o de reproceso se registra en una tabla `audit_log` del servicio (`id, at, caller, actor, action, target, metadata jsonb`) y en el log estructurado con `audit: true`. Expuesta en `GET /internal/admin/audit?limit=` (contrato `AuditEntrySchema`).

## 3. Rutas nuevas

### promotions-service
- `GET /internal/admin/promotions?brand=sis` → `AdminPromotionListResponseSchema` (incluye inactivas).
- `POST /internal/admin/promotions` (cuerpo `AdminPromotionInputSchema`) → 201 `AdminPromotionSchema`; 409 si el id existe.
- `PUT /internal/admin/promotions/:id` → 200 `AdminPromotionSchema`.
- `POST /internal/admin/promotions/:id/deactivate` → 200.
- `GET /internal/admin/specialties?brand=sis` y `PUT /internal/admin/specialties/:id` (`AdminSpecialtyInputSchema`).
- Tras cualquier cambio: `POST {WEB_REVALIDATE_URL}` con cabecera `x-revalidate-secret: {WEB_REVALIDATE_SECRET}` y cuerpo `{"tags":["catalog"]}` (B8). Fallo = warn, nunca rompe la operación.
- `GET /api/v1/promotions` y `/api/v1/specialties` devuelven `ETag` (hash del cuerpo) y responden 304 a `If-None-Match` (B9).

### leads-service (públicas, vía gateway)
- `POST /api/v1/leads` — ver §5.
- `GET /api/v1/leads/:leadId/status` — exige `x-lead-token` (C18). 401 si falta o no coincide (respuesta idéntica a 404 para no revelar existencia: usar 404 en ambos casos).
- `POST /api/v1/leads/:leadId/feedback` — `LeadFeedbackRequestSchema`, exige `x-lead-token`, una sola vez por lead (409 si ya existe). Publica `lead.feedback.v1`.
- `POST /api/v1/complaints` — `ComplaintRequestSchema` → 201 `ComplaintResponseSchema` (A5). Código `SIS-LR-<año>-<6 dígitos>` correlativo por marca y año. `responseDueBy` = recepción + 15 días hábiles (lunes a viernes; feriados nacionales de Perú en una lista configurable `PERU_HOLIDAYS` YYYY-MM-DD separada por comas).
- `POST /api/v1/privacy/requests` — `PrivacyRequestSchema` → 201 `PrivacyRequestResponseSchema` (C9). Código `SIS-ARCO-<año>-<6 dígitos>`; `responseDueBy` = 20 días hábiles.
- `POST /api/v1/tracking/events` — acepta los eventos nuevos y el campo `experiment`.

### leads-service (internas)
- `GET /internal/admin/leads` (`AdminLeadListQuerySchema`) → `AdminLeadListResponseSchema` (A2). Datos personales descifrados solo aquí.
- `GET /internal/admin/leads.csv` (mismos filtros) → `text/csv; charset=utf-8` con BOM, máximo 10 000 filas.
- `GET /internal/admin/leads/:leadId` → `AdminLeadSchema`.
- `POST /internal/admin/leads/:leadId/anonymize` cuerpo `{ "deleteCrmContact": boolean }` → anonimiza y publica `lead.anonymized.v1` (reason `admin`).
- `GET /internal/admin/complaints?status=&page=&pageSize=` y `POST /internal/admin/complaints/:id/response` (`AdminComplaintResponseInputSchema`).
- `GET /internal/admin/privacy-requests?status=` y `POST /internal/admin/privacy-requests/:id/resolution` (`AdminPrivacyResolutionInputSchema`).
- `GET /internal/reports/funnel?brand&from&to` → `FunnelReportSchema` (A16).
- `GET /internal/reports/daily?date=YYYY-MM-DD` → `DailyReportSchema` (A20).
- `GET /internal/admin/audit?limit=`.

### crm-bridge-service (internas)
- Existentes: `POST /internal/integrations/retry`, `GET /internal/integrations/jobs` (ahora con el guard común).
- `GET /internal/integrations/summary` → `IntegrationSummarySchema` (A27). Las profundidades de cola se obtienen con `checkQueue`.
- `GET /internal/admin/audit?limit=`.

## 4. Web ↔ backend

- web-sis consulta el catálogo con `fetch(..., { next: { tags: ['catalog'], revalidate: 300 } })` y expone `POST /api/revalidate` (verifica `x-revalidate-secret` contra `REVALIDATE_SECRET` en tiempo constante; llama `revalidateTag`).
- Desarrollo: `REVALIDATE_SECRET=dev-revalidate-secret` (web) y `WEB_REVALIDATE_SECRET=dev-revalidate-secret`, `WEB_REVALIDATE_URL=http://localhost:3000/api/revalidate` (promotions).
- Reescrituras de desarrollo de Next añaden `/api/v1/complaints` y `/api/v1/privacy/:path*` → leads-service. El gateway también (Traefik).
- Turnstile (C3): web `NEXT_PUBLIC_TURNSTILE_SITE_KEY`; leads `TURNSTILE_SECRET_KEY`. Si la clave del servidor está vacía, no se exige token. Verificación: `POST https://challenges.cloudflare.com/turnstile/v0/siteverify` (`secret`, `response`, `remoteip`), tiempo de espera 3 s; fallo de red = 503 `CAPTCHA_UNAVAILABLE`; token inválido = 400 `CAPTCHA_INVALID`.

## 5. Reglas de `POST /api/v1/leads` (cambios)

1. `Idempotency-Key` debe cumplir `IDEMPOTENCY_KEY_PATTERN` (UUID) → si no, 400 `IDEMPOTENCY_KEY_INVALID` (C19).
2. La clave se guarda con alcance de IP: `scopedKey = sha256(key + ":" + ipHash)`. Una misma clave desde otra IP no reproduce la respuesta (C19).
3. Turnstile si está configurado (C3).
4. Límite por IP con almacenamiento Redis compartido entre réplicas (C2): 10/min. Límite adicional por `phoneHash`: 5 por hora → 429 `RATE_LIMITED`.
5. `specialtyIds`: cada id debe existir en el catálogo (se valida con `GET /internal/promotions/:id/validate`, que ahora devuelve también las especialidades permitidas: añadir `allowedSpecialties: [{id, name, track}]` y `specialtiesIncluded` a la respuesta interna; leads-service la tipa localmente con Zod extendiendo `PromotionValidationSchema`). Cantidad ≤ `specialtiesIncluded` y track permitido → si no, 400 en `path: "specialtyIds"` (A3).
6. `campus` se guarda y viaja en el evento (A4).
7. La respuesta incluye `statusToken` = HMAC-SHA256(`LEAD_TOKEN_SECRET`, leadId) en base64url.
8. Datos personales cifrados en reposo (C8): ver §7.
9. El evento `lead.created.v1` incluye `campus`, `specialties`, `promotion.headline`, `promotion.priceAmount` y `client` (ip, userAgent, `fbc` de la cookie `_fbc`, `fbp` de `_fbp`, `eventSourceUrl` del `referer`) solo si `consent.marketingAccepted` (A17).
10. Correo de confirmación opcional (A7): si `SMTP_URL` está definido, enviar con `nodemailer` desde un consumidor del outbox interno (no en la petición): asunto «Tu solicitud SIS-XXXXX», enlace de WhatsApp y código. Remitente `MAIL_FROM`.

## 6. Eventos y colas

Routing keys y colas en `packages/api-contracts/src/events.ts`. Topología (infraestructura):

| Cola | Tipo | Bindings | Reintento |
| --- | --- | --- | --- |
| `crm-bridge.lead-created` (+`.retry`, `.dlq`) | quorum | `lead.created.v1` | como hoy (exchange `capsur.events.retry`, TTL 30 s) |
| `crm-bridge.lead-feedback` | quorum | `lead.feedback.v1` | sin reintento (idempotente, se descarta con log) |
| `crm-bridge.lead-anonymized` | quorum, `x-delivery-limit: 10` | `lead.anonymized.v1` | sin cola de reintento: el consumidor hace `nack` con requeue tras una pausa; el límite de entregas de quorum evita bucles |
| `crm-bridge.meta-capi` (+`.retry` TTL 60 s, `.dlq`) | quorum | `lead.created.v1` | principal → DLX `""` routing `crm-bridge.meta-capi.retry`; retry → DLX `""` routing `crm-bridge.meta-capi` |
| `leads.crm-status` | quorum | `crm.#` | como hoy |

Usuarios RabbitMQ por servicio (C21), desarrollo:

| Usuario | Contraseña local | configure | write | read |
| --- | --- | --- | --- | --- |
| `capsur` (admin, solo panel) | `capsur` | `.*` | `.*` | `.*` |
| `leads_svc` | `leads_svc_local` | `^$` | `^capsur\.events$` | `^leads\..*` |
| `crm_bridge_svc` | `crm_bridge_svc_local` | `^$` | `^(capsur\.events\|capsur\.events\.dlx\|amq\.default)$` | `^crm-bridge\..*` |

Los servicios solo usan `checkQueue` (no declaran). Infraestructura importa las definiciones en el broker en caliente (`POST /api/definitions` de la API de gestión) sin reiniciar contenedores. URLs locales: leads `amqp://leads_svc:leads_svc_local@localhost:5672`, crm-bridge `amqp://crm_bridge_svc:crm_bridge_svc_local@localhost:5672`.

## 7. Datos personales (C8, C9, C11)

- `@capsur/nest-kit` provee `PiiCipher` (AES-256-GCM; formato `v1.<iv>.<tag>.<ciphertext>` en base64url; clave `PII_ENCRYPTION_KEY` = 32 bytes en base64) y `hmacHash(value, key)` (HMAC-SHA256 hex; clave `PII_HASH_KEY`).
- leads-service cifra `fullName`, `phoneE164`, `email` y guarda `phone_hash`, `email_hash` para duplicados y búsqueda. crm-bridge cifra el `payload` de `sync_jobs`.
- Claves de desarrollo (no usar en producción): `PII_ENCRYPTION_KEY=ZGV2LW9ubHktcGlpLWtleS0zMi1ieXRlcy1sb25nISE=`, `PII_HASH_KEY=ZGV2LW9ubHktaGFzaC1rZXktMzItYnl0ZXMtbG9uZyEhIQ==`, `LEAD_TOKEN_SECRET=dev-only-lead-token-secret-change-me`.
- Retención: job diario anonimiza leads con más de `LEAD_RETENTION_DAYS` (730) días: nombre `[anonimizado]`, teléfono/correo cifrados vacíos, hashes nulos, atribución borrada, `anonymized_at`; publica `lead.anonymized.v1` (reason `retention`).
- `consent_records` es append-only: trigger que rechaza DELETE y solo permite UPDATE que ponga `ip_hash`/`user_agent` en NULL.

## 8. Integraciones de crm-bridge

| Variable | Defecto | Uso |
| --- | --- | --- |
| `CHATWOOT_INBOX_ID_BY_CAMPUS` | `{"tacna":1}` | Bandeja por sede (A4); si no hay entrada, `CHATWOOT_INBOX_ID` |
| `CHATWOOT_BASE_URL_ALLOWLIST` | `chatwoot.example.com` | Hosts permitidos para `CHATWOOT_BASE_URL` (C20); https obligatorio en producción |
| `ASSIGNMENT_STRATEGY` | `round_robin` | `least_loaded` consulta agentes y conversaciones abiertas en Chatwoot (A9) |
| `CHATWOOT_AUTO_REPLY_ENABLED` | `false` | Mensaje automático al vincular conversación con código (A8) |
| `CATALOG_URLS_JSON` | `{}` | `{ "<promotionId>": "<url del catálogo PDF>" }` |
| `WHATSAPP_FOLLOWUP_ENABLED` | `false` | Plantilla aprobada si no escribió tras N horas (A6) |
| `WHATSAPP_FOLLOWUP_TEMPLATE_NAME` / `_LANGUAGE` / `_AFTER_HOURS` | `` / `es` / `24` | |
| `META_PIXEL_ID` / `META_CAPI_ACCESS_TOKEN` / `META_CAPI_TEST_EVENT_CODE` | vacíos | Meta Conversions API (A17); vacío = desactivado; solo con `marketingAccepted` |
| `WEBHOOK_IP_ALLOWLIST` | vacío | CIDR o IPs separadas por comas; vacío = sin filtro (C7) |
| `CHATWOOT_WEBHOOK_SECRET_PREVIOUS` | vacío | Rotación del token de URL sin cortar el servicio (C7) |

`lead.feedback.v1` actualiza el atributo `how_heard` del contacto. `lead.anonymized.v1` borra el payload cifrado del job y, si `deleteCrmContact`, elimina el contacto en Chatwoot.

## 9. Transversales (`@capsur/nest-kit`)

- `bootstrapService(app, options)`: helmet, CORS, `trust proxy`, límite JSON 100 kb, 415 para POST/PUT/PATCH sin `application/json` (excepto rutas marcadas), shutdown hooks, Swagger condicionado, Sentry.
- Logging: nestjs-pino con redacción común (`authorization`, `cookie`, `x-lead-token`, `api_access_token`, `*.fullName`, `*.phone`, `*.email`, `*.phone_number`, `*.documentNumber`), `x-request-id`, salida asíncrona en producción y `pino-pretty` en desarrollo (B21).
- `HealthModule` con indicadores registrables, caché de 5 s y tiempo de espera por chequeo (B19).
- `RedisThrottlerStorage` para `@nestjs/throttler` (C2).
- `RabbitMqConnection` y `RabbitMqPublisher` comunes (B5) con apagado ordenado de consumidores (B20).
- `initSentry({ service })` con `beforeSend` que elimina PII; `SENTRY_DSN` vacío = desactivado (C23).
- Errores: `ProblemDetailsFilter` y `ZodValidationPipe` comunes (B4).

## 10. Variables comunes (`@capsur/config`)

`PORT`, `NODE_ENV`, `LOG_LEVEL`, `DATABASE_URL`, `REDIS_URL`, `RABBITMQ_URL`, `INTERNAL_API_TOKENS`, `SWAGGER_ENABLED`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `CORS_ORIGINS`, `PII_ENCRYPTION_KEY`, `PII_HASH_KEY`. Cada servicio compone su esquema con fragmentos de `@capsur/config` y genera su `.env.example` con `capsur-env-example` (B25).
