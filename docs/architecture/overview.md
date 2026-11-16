# Arquitectura general

## Objetivo

Captar interesados para las marcas de GRUPO CAPSUR (primera: SIS) con una experiencia web rápida, un registro de solicitudes fiable y una integración con Chatwoot que nunca bloquee al usuario. Las próximas marcas reutilizan contratos, componentes de interfaz e infraestructura sin copiar servicios.

## Componentes

```mermaid
flowchart LR
  subgraph Navegador
    W[web-sis<br/>Next.js]
  end
  GW[api-gateway<br/>Traefik]
  P[promotions-service<br/>NestJS + PostgreSQL + Redis]
  L[leads-service<br/>NestJS + PostgreSQL + Redis]
  C[crm-bridge-service<br/>NestJS + PostgreSQL]
  MQ[(RabbitMQ<br/>capsur.events)]
  CW[Chatwoot<br/>externo]
  WA[WhatsApp Cloud API]

  W -->|GET /api/v1/promotions| GW --> P
  W -->|POST /api/v1/leads| GW --> L
  L -->|GET /internal/promotions/:id/validate| P
  L -->|lead.created.v1 (outbox)| MQ
  MQ -->|crm-bridge.lead-created| C
  C -->|API contactos / etiquetas| CW
  C -->|crm.contact.synced.v1| MQ
  MQ -->|leads.crm-status| L
  CW -->|webhook firmado| GW --> C
  CW <--> WA
```

| Servicio | Responsabilidad | Datos propios |
| --- | --- | --- |
| web-sis | Landing, formulario, SEO, estados verificables | ninguno |
| promotions-service | Marcas, especialidades, campañas, promociones, precios y vigencias | `brands`, `specialties`, `campaigns`, `promotions` |
| leads-service | Registro de solicitudes, validación, consentimiento, atribución, idempotencia, outbox, estado CRM, tracking | `leads`, `lead_submissions`, `consent_records`, `lead_attributions`, `outbox_events`, `tracking_events`, `processed_events` |
| crm-bridge-service | Sincronización con Chatwoot, etiquetas, correlación de conversaciones, webhooks, reintentos y reproceso | `sync_jobs`, `crm_contact_links`, `integration_attempts`, `processed_events`, `webhook_events` |
| api-gateway | Enrutamiento, límites de tasa, cabeceras de seguridad (TLS lo termina EasyPanel) | ninguno |

## Reglas obligatorias

1. Cada servicio es desplegable y versionable por separado.
2. Un servicio nunca lee tablas de otro; se comunica por API documentada (síncrono) o eventos (asíncrono).
3. Cada servicio tiene su base de datos, usuario y migraciones.
4. Las reglas de negocio viven en `domain`/`application`, nunca en controladores ni componentes visuales.
5. Chatwoot se integra solo por API y webhooks; no se modifica ni se consulta su base de datos.
6. El backend es la autoridad sobre precios y vigencias.

## Arquitectura interna de cada servicio

Clean Architecture con cuatro capas (`presentation` → `application` → `domain`; `infrastructure` implementa los puertos). Ver [service-conventions.md](service-conventions.md).

## Resiliencia

- **Outbox transaccional** en leads-service: el evento se guarda en la misma transacción que el lead; un relay lo publica con confirmaciones y reintentos exponenciales.
- **Colas de reintento y DLQ** en RabbitMQ: `crm-bridge.lead-created` → `…retry` (TTL 30 s) → de vuelta; tras `MAX_SYNC_ATTEMPTS` a `…dlq` y evento `crm.sync.failed.v1`.
- **Idempotencia** en los tres niveles: cabecera `Idempotency-Key` en la API, `processed_events` en consumidores, upserts en Chatwoot por teléfono.
- **Degradación**: la landing usa un catálogo de respaldo si el catálogo no responde; Redis caído nunca tumba una petición; RabbitMQ caído no impide registrar leads.

## Escalabilidad

Hoy: un VPS con EasyPanel, un contenedor por servicio, Postgres/Redis/RabbitMQ aislados. Mañana: más réplicas de leads-service o del worker (los consumidores son idempotentes y el relay usa `SKIP LOCKED`), bases y broker en infraestructura separada, varios nodos. Un solo VPS no da alta disponibilidad real: la mitigación es backups, health checks y despliegue reversible.

## Segunda etapa

`analytics-service` (embudos, atribución, métricas de campaña a partir de `tracking_events` y eventos), `admin-web` (gestión de promociones y reglas de asignación), plantillas de landing por marca, pruebas A/B y automatización de envío de catálogos con plantillas aprobadas de WhatsApp.
