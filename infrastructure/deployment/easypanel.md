# Despliegue en EasyPanel

Cada servicio es una app independiente en EasyPanel construida desde este repositorio con su propio Dockerfile (`apps/<servicio>/Dockerfile`, **contexto = raíz del repo**; BuildKit aplica `apps/<servicio>/Dockerfile.dockerignore`). TLS y dominios los gestiona el Traefik de EasyPanel; `infrastructure/docker/traefik/dynamic.prod.yml` es la referencia de rutas, límites y cabeceras a replicar, y `infrastructure/docker/docker-compose.prod.yml` la referencia completa del stack (también sirve para un VPS con Docker sin EasyPanel).

Variables: plantilla en `infrastructure/docker/prod.env.example`; inventario, gestor y rotación en `docs/security/secrets.md`. Ninguna variable de producción tiene valor por defecto.

## Orden recomendado

1. **Postgres 17** (servicio de base de datos de EasyPanel o contenedor propio):
   - Sin dominio ni puerto público.
   - Ejecutar `infrastructure/docker/postgres/prod-roles.sql` con `psql -v ...` (o montar `init-prod-roles.sh` en el primer arranque): crea `promotions`, `leads`, `crm_bridge`, los roles `<svc>_migrator` (dueño del esquema) y `<svc>_app` (solo DML, sin CREATEDB), `pgbouncer_auth` y `backup`.
   - TLS obligatorio (`ssl=on`, `pg_hba.prod.conf`); ver docs/operations/backups.md § TLS.
2. **PgBouncer** (`edoburu/pgbouncer:v1.24.1-p1`, modo `transaction`, `auth_query`): variables como en el compose de producción. Los servicios se conectan a PgBouncer; las migraciones, directamente a Postgres.
3. **Redis 7** sin dominio, con `redis/users.acl` + `redis/start-redis.sh` (ACL por servicio, sin persistencia).
4. **RabbitMQ 4** sin dominio público. El panel de gestión (15672) solo por túnel SSH o red privada. Tras arrancar, aplicar topología y usuarios:
   `RABBITMQ_MGMT_URL=http://rabbitmq:15672 RABBITMQ_ADMIN_USER=... RABBITMQ_ADMIN_PASS=... RABBITMQ_PASSWORD_LEADS_SVC=... RABBITMQ_PASSWORD_CRM_BRIDGE_SVC=... node infrastructure/rabbitmq/apply-definitions.mjs`
   (o el servicio `rabbitmq-setup` del compose). Es idempotente y se puede re-ejecutar en caliente.
5. **Jobs de migración** (B6): por cada servicio, una app/tarea con el mismo Dockerfile y **target `migrate`** (`--target migrate`), variable `DATABASE_URL` con el rol `<svc>_migrator` y conexión directa (`...@postgres:5432/<db>?schema=public&sslmode=require`). Se ejecuta antes de cada despliegue y termina; si falla, no se despliega el servicio. Los contenedores de los servicios **ya no migran al arrancar**.
6. **promotions-service** → `DATABASE_URL` vía PgBouncer con el rol `_app`:
   `postgresql://promotions_app:<pwd>@pgbouncer:5432/promotions?schema=public&pgbouncer=true&connection_limit=5`
   (`pgbouncer=true` desactiva las sentencias preparadas con nombre de Prisma; `connection_limit` = conexiones por réplica). `WEB_REVALIDATE_URL=http://web-sis:3000/api/revalidate` y `WEB_REVALIDATE_SECRET`. Sembrar una vez desde una máquina con acceso a la base: `pnpm --filter @capsur/promotions-service db:seed`.
7. **leads-service** → `PROMOTIONS_SERVICE_URL` interno, `PROMOTIONS_SERVICE_TOKEN`, `RABBITMQ_URL` con `leads_svc`, `REDIS_URL` con `leads_svc`, claves PII, `LEAD_TOKEN_SECRET`, `TURNSTILE_SECRET_KEY`, `SMTP_URL`/`MAIL_FROM` si aplica.
8. **crm-bridge-service** → `RABBITMQ_URL` con `crm_bridge_svc`, credenciales de Chatwoot, `CHATWOOT_BASE_URL_ALLOWLIST`, `WEBHOOK_IP_ALLOWLIST`, `META_*` (opcional), `INTERNAL_API_TOKENS` con el llamador `ops` (reemplaza a la antigua `INTERNAL_API_TOKEN`).
9. **web-sis** → `NEXT_PUBLIC_*` como **argumentos de build** (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `NEXT_PUBLIC_SENTRY_DSN`, etc.); en runtime `PROMOTIONS_SERVICE_URL`, `LEADS_SERVICE_URL`, `REVALIDATE_SECRET`.
10. **admin-web** → dominio **propio** (`admin.<dominio>`), nunca bajo el de la landing. Variables: `*_SERVICE_URL` internas, `PROMOTIONS_SERVICE_TOKEN`, `LEADS_SERVICE_TOKEN`, `CRM_BRIDGE_SERVICE_TOKEN`, `ADMIN_SESSION_SECRET`, `ADMIN_USERS_JSON`, `ADMIN_COOKIE_SECURE=true`. Restringir por IP (oficinas/VPN) con un middleware `ipAllowList` en el dominio del panel.
11. **Backups**: app con la imagen de `infrastructure/docker/backup`, volumen persistente y variables `PG*`/`BACKUP_*` (docs/operations/backups.md).
12. **Rutas públicas** en el dominio de la landing (ADR 0007):
    - `/api/v1/promotions*`, `/api/v1/specialties*` → promotions
    - `/api/v1/leads*`, `/api/v1/tracking*`, `/api/v1/complaints*`, `/api/v1/privacy*` → leads
    - `/webhooks/chatwoot` → crm-bridge
    - resto → web-sis
    - **Bloquear** `/internal/*` y `/api/revalidate` (403) en todos los dominios. Límite de cuerpo 1 MB, compresión, HSTS y TLS ≥ 1.2.
13. **Webhook en Chatwoot**: `https://<dominio>/webhooks/chatwoot?token=<CHATWOOT_WEBHOOK_SECRET>` con los eventos `conversation_created`, `message_created`, `conversation_updated`, `conversation_status_changed`. Rotación: docs/security/chatwoot-webhooks.md.

## Endurecimiento de cada app (C15)

Las imágenes ya corren como usuario `node` con `tini`, sin npm ni corepack, y con `HEALTHCHECK`. En EasyPanel (o en el compose) además:

- Sistema de archivos de solo lectura con `tmpfs` en `/tmp` (y en `/app/apps/<web>/.next/cache` para web-sis y admin-web).
- `cap_drop: ALL`, `no-new-privileges`.
- Límites: servicios Nest 1 CPU / 512 MB; web-sis 1 CPU / 768 MB; admin-web 0,5 CPU / 512 MB; Postgres 2 CPU / 2 GB.

## Operación

- Health checks: `GET /internal/health` en cada servicio y `/api/health` en las webs (EasyPanel los usa para reinicios).
- Logs JSON por contenedor (sin datos personales); nivel con `LOG_LEVEL`.
- Errores en Sentry (`SENTRY_DSN` por servicio; vacío = desactivado) con PII eliminada.
- Reversión: redeploy de la imagen anterior; las migraciones son aditivas (expandir/contraer), así que la versión anterior funciona con el esquema nuevo.
- Reproceso manual de sincronizaciones fallidas: desde admin-web (estado de integraciones) o `POST /internal/integrations/retry` con el token del llamador `ops`.
- Alertas y paneles: `infrastructure/monitoring/README.md`.
