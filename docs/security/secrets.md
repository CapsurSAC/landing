# Gestión de secretos (C6)

## Principios

1. **Ningún secreto en el repositorio.** Solo existen valores de desarrollo documentados en la spec (`dev-*`, claves PII de desarrollo, contraseñas `*_local`) y marcadores `ejemplo-*` / `change-me`. `gitleaks` (workflow `security.yml`, config `.gitleaks.toml`) bloquea cualquier otro valor con forma de secreto.
2. **Un valor por entorno.** Local, staging y producción nunca comparten secretos.
3. **Mínimo alcance.** Cada servicio recibe solo sus secretos (tabla siguiente). El compose de producción exige cada variable (`${VAR:?}`) y no tiene valores por defecto.
4. **Rotación planificada y tras incidente.** Calendario abajo; cualquier sospecha de fuga activa la rotación inmediata (docs/security/incident-response.md).

## Gestor recomendado

| Opción                      | Cuándo                         | Notas                                                                                                                                                                                                               |
| --------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Infisical** (recomendado) | Producción en VPS o EasyPanel  | Código abierto, autoalojable o SaaS; entornos, versionado, auditoría de accesos, rotación programada de credenciales Postgres; CLI `infisical run -- docker compose ...` o sincronización a variables de EasyPanel. |
| Doppler                     | Si se prefiere SaaS gestionado | Similar; integración directa con GitHub Actions.                                                                                                                                                                    |
| Variables de EasyPanel      | Transitorio                    | Cifradas en el panel, pero sin versionado ni auditoría fina: documentar quién cambia qué en el registro de cambios.                                                                                                 |

Reglas de acceso: dos administradores con MFA; el equipo de desarrollo solo ve staging; la clave privada de backups (`age`) y la copia de `PII_ENCRYPTION_KEY` se guardan además en una bóveda offline (sobre sellado o gestor de contraseñas corporativo con acceso de emergencia).

Secretos de GitHub Actions: `TURBO_TOKEN`, `TURBO_TEAM` (variable), `GITLEAKS_LICENSE` (si el repositorio es de una organización), `STAGING_URL`. Nunca secretos de producción en Actions: el despliegue lo hace EasyPanel desde el repositorio.

## Inventario por servicio

Generación: `openssl rand -hex 32` (tokens y contraseñas que van en URLs), `openssl rand -base64 32` (claves de 32 bytes), `age-keygen` (backups).

| Secreto                                                                    | Servicio(s)                   | Uso                                                         | Rotación                                                                          |
| -------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `PII_ENCRYPTION_KEY`                                                       | leads, crm-bridge             | AES-256-GCM de datos personales (ADR 0009)                  | Anual o tras incidente, con re-cifrado `v1`→`v2`                                  |
| `PII_HASH_KEY`                                                             | leads, crm-bridge             | HMAC de teléfono/correo para duplicados                     | Solo tras incidente (exige recalcular hashes)                                     |
| `LEAD_TOKEN_SECRET`                                                        | leads                         | `statusToken` de `GET /api/v1/leads/:id/status`             | Anual (invalida enlaces de estado antiguos: aceptable)                            |
| `IP_HASH_PEPPER`                                                           | leads                         | Hash de IP (nunca se guarda en claro)                       | Anual                                                                             |
| `INTERNAL_API_TOKENS`                                                      | promotions, leads, crm-bridge | Tokens aceptados por llamador (ADR 0010)                    | Semestral, con solapamiento                                                       |
| `PROMOTIONS_SERVICE_TOKEN`                                                 | leads, admin-web              | Token propio como llamador                                  | Igual que el anterior                                                             |
| `LEADS_SERVICE_TOKEN`, `CRM_BRIDGE_SERVICE_TOKEN`                          | admin-web                     | Token propio como llamador                                  | Semestral                                                                         |
| `REVALIDATE_SECRET` / `WEB_REVALIDATE_SECRET`                              | web-sis / promotions          | Revalidación del catálogo (ADR 0008)                        | Anual                                                                             |
| `ADMIN_SESSION_SECRET`                                                     | admin-web                     | Firma de sesiones del panel                                 | Semestral (cierra todas las sesiones)                                             |
| `ADMIN_USERS_JSON`                                                         | admin-web                     | Usuarios, roles y hashes bcrypt                             | Al entrar/salir personas                                                          |
| `CHATWOOT_API_ACCESS_TOKEN`                                                | crm-bridge                    | API de Chatwoot (usuario agente-bot dedicado)               | Semestral                                                                         |
| `CHATWOOT_WEBHOOK_SECRET` (+`_PREVIOUS`)                                   | crm-bridge                    | Token del webhook en la URL                                 | Trimestral (ver chatwoot-webhooks.md)                                             |
| `META_CAPI_ACCESS_TOKEN`                                                   | crm-bridge                    | Conversions API                                             | Según caducidad del token de sistema de Meta                                      |
| `TURNSTILE_SECRET_KEY`                                                     | leads                         | Verificación de Turnstile                                   | Anual                                                                             |
| `SMTP_URL`                                                                 | leads                         | Envío de confirmaciones                                     | Anual o cambio de proveedor                                                       |
| `SENTRY_DSN` (por servicio)                                                | todos                         | Envío de errores                                            | No es secreto crítico; rotar si hay abuso                                         |
| `*_MIGRATOR_DB_PASSWORD`                                                   | jobs `*-migrate`              | Rol dueño del esquema                                       | Semestral                                                                         |
| `*_APP_DB_PASSWORD`                                                        | servicios                     | Rol DML vía PgBouncer                                       | Semestral                                                                         |
| `POSTGRES_SUPERPASSWORD`                                                   | postgres                      | Mantenimiento (nunca la usa un servicio)                    | Semestral                                                                         |
| `PGBOUNCER_AUTH_PASSWORD`                                                  | pgbouncer                     | `auth_query`                                                | Semestral                                                                         |
| `BACKUP_DB_PASSWORD`                                                       | pg-backup                     | Rol `backup` (solo lectura)                                 | Semestral                                                                         |
| `BACKUP_AGE_RECIPIENT` / clave privada                                     | pg-backup / operación         | Cifrado de copias (pública en el servidor, privada offline) | Anual; conservar las privadas antiguas mientras existan copias cifradas con ellas |
| `*_REDIS_PASSWORD`, `REDIS_*_PASSWORD`                                     | promotions, leads, redis      | ACL por servicio                                            | Semestral                                                                         |
| `RABBITMQ_ADMIN_PASSWORD`, `*_RABBITMQ_PASSWORD`, `RABBITMQ_ERLANG_COOKIE` | rabbitmq, leads, crm-bridge   | Usuarios por servicio (C21)                                 | Semestral                                                                         |
| `ACME_EMAIL`                                                               | gateway                       | Avisos de Let's Encrypt                                     | No es secreto                                                                     |

## Procedimientos de rotación

**Contraseñas de base de datos.** 1) Generar la nueva en el gestor. 2) `ALTER ROLE leads_app PASSWORD '...'` (o re-ejecutar `init-prod-roles.sh` con las nuevas variables). 3) Redesplegar el servicio. PgBouncer valida por `auth_query`, no necesita reinicio. Con varias réplicas, rotar fuera de horario punta: la ventana es de segundos.

**Tokens entre servicios (sin corte).** 1) Añadir un segundo token del mismo llamador al JSON del servicio llamado (p. ej. `{"admin-web":"nuevo","admin-web-old":"anterior"}` si el guard admite alias, o publicar primero el token nuevo en el llamado y luego en el llamador). 2) Redesplegar llamado. 3) Cambiar el token en el llamador y redesplegar. 4) Retirar el token anterior.

**Redis / RabbitMQ.** Cambiar la variable y redesplegar `redis` (regenera la ACL al arrancar) o re-ejecutar `rabbitmq-setup` (`docker compose ... up rabbitmq-setup`), y después el servicio consumidor.

**`PII_ENCRYPTION_KEY`.** Requiere soporte de versión de clave en `PiiCipher` (`v2.`): desplegar con ambas claves, ejecutar el job de re-cifrado, retirar la antigua. Documentar en el registro de incidentes/cambios.

## Si un secreto se filtra

1. Revocarlo/rotarlo de inmediato (procedimientos de arriba).
2. Si estaba en git: rotar es obligatorio; reescribir el historial no basta (puede haber clones y cachés).
3. Revisar logs de acceso del sistema afectado desde la fecha de exposición.
4. Registrar el incidente y evaluar notificación (docs/security/incident-response.md).
