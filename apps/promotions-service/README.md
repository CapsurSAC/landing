# promotions-service

Catálogo comercial de la plataforma de captación de GRUPO CAPSUR: marcas, especialidades, campañas y promociones con precios y vigencias. Es la **autoridad sobre precios**: `leads-service` consulta aquí antes de registrar una solicitud, la landing (`web-sis`) pinta las tarjetas con lo que este servicio devuelve y el panel (`admin-web`) lo administra. Primera marca: IEST Privado Sistemas del Sur (`sis`).

- NestJS 11 con Clean Architecture (`domain` → `application` → `infrastructure`/`presentation`).
- Piezas transversales del kit `@capsur/nest-kit`: errores problem-details, logs JSON con redacción de datos personales, salud con caché, token entre servicios, auditoría, límites de cuerpo, Sentry.
- Variables validadas con `@capsur/config` (`src/config/env.definition.ts`).
- Base de datos propia: PostgreSQL vía Prisma 6 (`DATABASE_URL`). Caché opcional en Redis (`REDIS_URL`).

## Endpoints

### Públicos (gateway, `/api/v1`)

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/v1/promotions?brand=sis` | Promociones activas y vigentes, ordenadas por `sortOrder` (`PromotionsResponse`). |
| `GET` | `/api/v1/specialties?brand=sis&track=ia\|tradicional` | Especialidades activas (`SpecialtiesResponse`). |

Ambas devuelven `Cache-Control: public, max-age=60, stale-while-revalidate=300` y `ETag`; con `If-None-Match` igual responden **304** sin cuerpo (B9). Una marca inexistente responde 404.

### Internos (red de servicios; exigen `Authorization: Bearer <token>` salvo el health)

| Método | Ruta | Quién | Descripción |
| --- | --- | --- | --- |
| `GET` | `/internal/promotions/:id/validate?brand=sis` | leads-service | Precio autoritativo, `active`, `specialtiesIncluded` y `allowedSpecialties` (especialidades activas de los tracks permitidos, A3). Sin caché. |
| `GET` | `/internal/admin/promotions?brand=sis` | admin-web | Todas las promociones, incluidas las inactivas (`AdminPromotionListResponse`). |
| `POST` | `/internal/admin/promotions` | admin-web | Crea (`AdminPromotionInput`) → 201. 409 si el id existe; 400 si la campaña no existe o falla una regla. |
| `PUT` | `/internal/admin/promotions/:id` | admin-web | Reemplaza los campos editables. El `id` del cuerpo debe coincidir con la ruta. |
| `POST` | `/internal/admin/promotions/:id/deactivate?brand=sis` | admin-web | Desactiva (no borra). |
| `GET` / `PUT` | `/internal/admin/specialties`, `/internal/admin/specialties/:id` | admin-web | Lista (incluye inactivas) y edición (`AdminSpecialtyInput`). |
| `GET` | `/internal/admin/audit?limit=50` | admin-web | Últimas acciones auditadas (`AuditEntry`). |
| `GET` | `/internal/health` | orquestador | Público. PostgreSQL caído → `down` (503); Redis caído → `degraded` (200). |
| `GET` | `/internal/docs`, `/internal/docs-json` | equipo | Swagger, solo fuera de producción (o `SWAGGER_ENABLED=true` + token). |

Tokens permitidos en `INTERNAL_API_TOKENS` (JSON `{"<llamador>":"<token>"}`). La cabecera `x-actor` (correo del usuario del panel) se guarda en la auditoría.

### Reglas de negocio al editar (dominio)

- `validUntil` posterior a `validFrom`; precio > 0; `listPrice`, si existe, mayor que el precio.
- Entre 1 y 3 especialidades por paquete; al menos un track permitido, sin repetidos.
- Errores como problem-details con `errors: [{ path, message }]`: `INVALID_CATALOG_DATA`, `CAMPAIGN_NOT_FOUND` (400), `PROMOTION_ALREADY_EXISTS` (409), `PROMOTION_NOT_FOUND`, `SPECIALTY_NOT_FOUND`, `BRAND_NOT_FOUND` (404). Además, del kit: `VALIDATION_FAILED` (400), `UNAUTHORIZED` (401), `PAYLOAD_TOO_LARGE` (413, cuerpo > 100 kb), `UNSUPPORTED_MEDIA_TYPE` (415).

### Después de cada cambio (B8)

1. Se borran de Redis las claves `catalog:v2:<marca>:*` (promociones y especialidades).
2. Se llama a la landing: `POST WEB_REVALIDATE_URL` con `x-revalidate-secret` y `{"tags":["catalog"]}`. Si falla, solo se registra un aviso: la landing refresca por tiempo (máx. 5 min) y el cambio ya está guardado.
3. La acción queda en `audit_log` con llamador, persona, ruta y objetivo (nunca el cuerpo).

## Variables de entorno

Generadas en `.env.example` desde el esquema (`pnpm --filter @capsur/promotions-service env:example`; no editar a mano).

| Variable | Por defecto | Descripción |
| --- | --- | --- |
| `PORT` | `3001` | Puerto HTTP (`0.0.0.0`). |
| `NODE_ENV` | `development` | `production` desactiva Swagger y emite logs JSON asíncronos. |
| `LOG_LEVEL` | `info` | Nivel de pino. |
| `DATABASE_URL` | — | PostgreSQL. En producción vía PgBouncer (`pgbouncer=true&connection_limit=5`). |
| `REDIS_URL` | — | Caché opcional. |
| `CATALOG_CACHE_TTL_SECONDS` | `60` | TTL de la caché del catálogo. |
| `CORS_ORIGINS` | vacío | Orígenes CORS (CSV). |
| `INTERNAL_API_TOKENS` | — | Llamadores internos y sus tokens. |
| `SWAGGER_ENABLED` | `false` | Swagger en producción. |
| `SENTRY_DSN` | vacío | Vacío = Sentry desactivado. |
| `WEB_REVALIDATE_URL` / `WEB_REVALIDATE_SECRET` | — | Aviso de revalidación a la landing. |

## Cómo correr en local

```bash
cp apps/promotions-service/.env.example apps/promotions-service/.env
pnpm --filter @capsur/promotions-service db:generate
pnpm --filter @capsur/promotions-service db:migrate
pnpm --filter @capsur/promotions-service db:seed
pnpm --filter @capsur/promotions-service dev
```

```bash
curl http://localhost:3001/api/v1/promotions
curl -H "Authorization: Bearer dev-leads-to-promotions" http://localhost:3001/internal/promotions/dos-por-uno/validate
curl -H "Authorization: Bearer dev-admin-to-promotions" -H "x-actor: yo@capsur.local" http://localhost:3001/internal/admin/promotions
```

En contenedor las migraciones las ejecuta un job previo al despliegue (`--target migrate`), no el arranque del servicio.

### Migraciones

- `db:migrate` (`prisma migrate deploy`) aplica las migraciones versionadas.
- `db:migrate:dev` crea migraciones nuevas. En el stack local los usuarios de servicio tienen `CREATEDB` para la *shadow database*; en producción no (roles `_migrator`/`_app`).

## Pruebas y calidad

```bash
pnpm --filter @capsur/promotions-service typecheck
pnpm --filter @capsur/promotions-service lint
pnpm --filter @capsur/promotions-service test        # unitarias + e2e HTTP (sin infraestructura), SWC
pnpm --filter @capsur/promotions-service test:int    # repositorios contra PostgreSQL 17 real (Testcontainers; requiere Docker)
pnpm --filter @capsur/promotions-service openapi:export   # docs/api/openapi/promotions-service.json (sin base de datos)
```

- Unitarias: casos de uso con fakes (vigencia, caché, administración y reglas de negocio, aviso de cambio).
- e2e: `AppModule` real con el bootstrap del kit; cubre ETag/304, 401 sin token, validación con especialidades, administración con auditoría, 409/400, 415, 413 y salud.
- Integración: migraciones, `select` explícito, traducción de errores de Prisma (P2002/P2003/P2025) y auditoría ordenada.

## Estructura

```
prisma/              schema.prisma (incluye audit_log), migrations/, seed.ts
src/config/          env.definition.ts (esquema + ejemplos), env.ts (validación)
src/domain/          Brand, Specialty, Promotion (+ assertValidPromotion), errores de dominio
src/application/     ports/ (repositorios, CatalogCache, CatalogChangeNotifier, Clock), use-cases/, mappers/
src/infrastructure/  Prisma (repositorios, auditoría, salud), Redis (caché), aviso a la landing, reloj
src/presentation/    controladores públicos, internos y de administración; errores de dominio; OpenAPI
src/instrument.ts    Sentry (antes de crear la app)
src/main.ts          bootstrapService del kit
src/openapi-export.ts exportación del contrato sin infraestructura
```

### Caché

Claves `promotions-service:catalog:v2:<marca>:promotions` y `…:specialties:<track|all>` durante `CATALOG_CACHE_TTL_SECONDS`, invalidadas al editar desde el panel. La validación interna nunca usa caché. Los errores de Redis degradan a «sin caché» y nunca tumban una petición; la conexión se inicia al arrancar para que el primer chequeo de salud sea fiable, igual que la primera consulta a PostgreSQL.
