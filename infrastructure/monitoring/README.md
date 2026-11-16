# Monitoreo y alertas

## Qué expone cada componente

| Señal                | Dónde                                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Salud y dependencias | `GET /internal/health` en cada servicio (caché de 5 s y tiempo de espera por dependencia, B19) → `{ status: ok \| degraded \| down, checks }`; leads añade `outbox: { pending, failed }`. Webs: `GET /api/health` |
| Logs estructurados   | stdout en JSON (pino, transporte asíncrono en producción) con `req.id`/`x-request-id` y `traceId`; datos personales y secretos redactados                                                                         |
| Auditoría            | `audit: true` en logs y `GET /internal/admin/audit?limit=` por servicio (quién hizo qué desde el panel o como `ops`)                                                                                              |
| Integraciones        | `GET /internal/integrations/summary` (crm-bridge: trabajos por estado y profundidad de colas vía `checkQueue`) y la pantalla de estado de admin-web                                                               |
| Colas                | Panel de RabbitMQ (`:15672`, solo red privada) o API `GET /api/queues`                                                                                                                                            |
| Errores              | Sentry por servicio (`SENTRY_DSN`, `SENTRY_ENVIRONMENT`), `beforeSend` elimina PII (C23)                                                                                                                          |
| Rendimiento web      | Lighthouse CI en cada PR (`.lighthouserc.json`) y CrUX del dominio                                                                                                                                                |
| Backups              | Healthcheck del servicio `backup` (marca `ok-*` < 26 h) y registro mensual de restauración                                                                                                                        |

## Colas a vigilar

| Cola                            | Normal                       | Alerta                                                                                                                                           |
| ------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `crm-bridge.lead-created`       | ≈ 0 (se consume en segundos) | > 50 mensajes durante 5 min (crm-bridge caído o Chatwoot lento)                                                                                  |
| `crm-bridge.lead-created.retry` | Pocos, transitorios          | > 20 durante 15 min                                                                                                                              |
| `crm-bridge.lead-created.dlq`   | 0                            | **> 0** → revisar Chatwoot y reprocesar desde admin-web o `/internal/integrations/retry`                                                         |
| `crm-bridge.meta-capi`          | ≈ 0                          | > 100 durante 10 min                                                                                                                             |
| `crm-bridge.meta-capi.retry`    | Pocos (TTL 60 s)             | > 50 durante 15 min (token de Meta caducado o API caída)                                                                                         |
| `crm-bridge.meta-capi.dlq`      | 0                            | **> 0** → revisar `META_CAPI_ACCESS_TOKEN`, errores 4xx de Meta; los eventos de conversión pierden valor tras 7 días: decidir reenvío o descarte |
| `crm-bridge.lead-feedback`      | ≈ 0                          | > 50 (sin reintento: los fallos se descartan con log)                                                                                            |
| `crm-bridge.lead-anonymized`    | ≈ 0                          | Mensajes con `x-delivery-count` cerca de 10 (límite de entregas): borrado en Chatwoot fallando repetidamente; **obligatorio resolver** (ARCO)    |
| `leads.crm-status`              | ≈ 0                          | > 50 durante 5 min (leads-service no consume)                                                                                                    |

Consulta rápida (red privada): `curl -su "$RABBITMQ_ADMIN_USER:$RABBITMQ_ADMIN_PASSWORD" http://rabbitmq:15672/api/queues | jq '.[] | {name, messages}'`.

## Alertas mínimas recomendadas

1. `status = down` en cualquier health durante más de 2 minutos.
2. `outbox.failed > 0` o `outbox.pending > 50` durante 5 minutos (leads-service).
3. Cualquier mensaje en `crm-bridge.lead-created.dlq` o `crm-bridge.meta-capi.dlq`.
4. Mensajes atascados en `crm-bridge.lead-anonymized` (incumplimiento ARCO si no se resuelve).
5. Tasa de 5xx en el gateway > 1 % en 5 minutos.
6. Picos de 401/403 en `/webhooks/chatwoot` (token inválido: posible filtración o sondeo, ver docs/security/chatwoot-webhooks.md).
7. Picos de 429 en `POST /api/v1/leads` (abuso o límite demasiado bajo) y de `CAPTCHA_UNAVAILABLE` (Turnstile caído).
8. Backup sin marca `ok-*` en 26 h (healthcheck del servicio `backup` en `unhealthy`).
9. Web: LCP móvil p75 > 2,5 s o CLS > 0,1 (Lighthouse CI o CrUX).
10. Certificados TLS a < 14 días de caducar (Traefik/ACME los renueva a 30 días; si no lo hizo, algo falla).

## Sentry

- Proyectos: `web-sis`, `admin-web`, `promotions-service`, `leads-service`, `crm-bridge-service` (un DSN por proyecto; variables `*_SENTRY_DSN` y `NEXT_PUBLIC_SENTRY_DSN`).
- `SENTRY_ENVIRONMENT=production|staging|local`; `release` = versión de changesets del paquete (`@capsur/<app>@x.y.z`).
- `beforeSend` (nest-kit / configuración de Next) elimina nombre, teléfono, correo, documento, cabeceras `authorization`/`cookie`/`x-lead-token` y la query `token`.
- Reglas de alerta en Sentry: nuevo issue en producción; > 10 eventos/5 min de un mismo issue; errores con etiqueta `webhook_signature` o `dlq` (los servicios las añaden al capturar esos casos).
- Muestreo de trazas bajo (`tracesSampleRate` 0,05) y sin _session replay_ en la landing (datos personales en el formulario).

## Herramienta sugerida

Uptime Kuma (autoalojado en EasyPanel) para health checks HTTP y avisos por correo/Telegram; un pequeño job que consulte `/api/queues` y `/internal/integrations/summary` cada minuto para las alertas de colas. Si se adopta Prometheus más adelante: `rabbitmq_prometheus` (puerto 15692) y `postgres_exporter`.
