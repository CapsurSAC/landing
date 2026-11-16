# Contrato HTTP y eventos

La fuente de verdad es `packages/api-contracts` (esquemas Zod). Cada servicio exporta su OpenAPI a [`openapi/`](openapi/README.md) (`pnpm openapi:export`) y CI rechaza cambios incompatibles frente a la rama base (`oasdiff breaking`). En ejecución, `GET /internal/docs-json` solo existe fuera de producción (o con `SWAGGER_ENABLED=true` y token). Especificación completa de la v2: [`../architecture/v2-integration-spec.md`](../architecture/v2-integration-spec.md).

## Endpoints públicos (vía gateway)

| Método | Ruta                                                        | Servicio   | Respuesta                                                    |
| ------ | ----------------------------------------------------------- | ---------- | ------------------------------------------------------------ |
| GET    | `/api/v1/promotions?brand=sis`                              | promotions | `PromotionsResponse`                                         |
| GET    | `/api/v1/specialties?brand=sis&track=ia\|tradicional`       | promotions | `SpecialtiesResponse`                                        |
| POST   | `/api/v1/leads` (cabecera `Idempotency-Key`)                | leads      | `CreateLeadResponse` (201 nuevo, 200 duplicado/replay)       |
| GET    | `/api/v1/leads/{leadId}/status` (cabecera `x-lead-token`)   | leads      | `LeadStatusResponse` (404 si falta o no coincide)            |
| POST   | `/api/v1/leads/{leadId}/feedback` (cabecera `x-lead-token`) | leads      | 201 · 409 si ya existe                                       |
| POST   | `/api/v1/tracking/events`                                   | leads      | 202 `{ accepted: true }`                                     |
| POST   | `/api/v1/complaints`                                        | leads      | 201 `ComplaintResponse` (código `SIS-LR-AAAA-NNNNNN`)        |
| POST   | `/api/v1/privacy/requests`                                  | leads      | 201 `PrivacyRequestResponse` (código `SIS-ARCO-AAAA-NNNNNN`) |
| POST   | `/webhooks/chatwoot?token=…`                                | crm-bridge | 202                                                          |

## Endpoints internos (red privada)

Todos exigen `Authorization: Bearer <token del llamador>` salvo `GET /internal/health` (ADR 0010). El gateway responde 403 a `/internal/*`.

| Método       | Ruta                                                                               | Servicio   |
| ------------ | ---------------------------------------------------------------------------------- | ---------- |
| GET          | `/internal/health`                                                                 | todos      |
| GET          | `/internal/docs`, `/internal/docs-json`                                            | todos      |
| GET          | `/internal/promotions/{id}/validate?brand=sis`                                     | promotions |
| GET/POST/PUT | `/internal/admin/promotions`, `/internal/admin/specialties`                        | promotions |
| GET          | `/internal/admin/leads`, `/internal/admin/leads.csv`, `/internal/admin/leads/{id}` | leads      |
| POST         | `/internal/admin/leads/{id}/anonymize`                                             | leads      |
| GET/POST     | `/internal/admin/complaints`, `/internal/admin/privacy-requests`                   | leads      |
| GET          | `/internal/reports/funnel`, `/internal/reports/daily`                              | leads      |
| POST         | `/internal/integrations/retry`                                                     | crm-bridge |
| GET          | `/internal/integrations/jobs`, `/internal/integrations/summary`                    | crm-bridge |
| GET          | `/internal/admin/audit?limit=`                                                     | todos      |

## Ejemplo: registrar una solicitud

```http
POST /api/v1/leads HTTP/1.1
Content-Type: application/json
Idempotency-Key: 7d1f0d3c-5f7e-4f0a-9d8a-0c1c2f6c1a11

{
  "brand": "sis",
  "promotionId": "con-ia",
  "fullName": "Nombre Apellido",
  "phone": "987 654 321",
  "phoneCountry": "PE",
  "email": "cliente@ejemplo.com",
  "consent": { "contactAccepted": true, "marketingAccepted": false, "privacyVersion": "2026-11" },
  "attribution": { "utmSource": "meta", "utmCampaign": "especialidades-ia" }
}
```

```json
{
  "leadId": "0b4cf28e-10c8-4a00-8cc6-510c6d5b772d",
  "reference": "SIS-7K3M2",
  "status": "registered",
  "phone": "+51987654321",
  "promotion": { "id": "con-ia", "name": "CON IA", "headline": "S/249" },
  "whatsapp": {
    "number": "51987654321",
    "prefilledMessage": "…",
    "url": "https://wa.me/51987654321?text=…"
  },
  "replayed": false
}
```

Los errores siguen el formato problem-details: `{ type, title, status, detail?, code?, errors?: [{ path, message }], traceId? }`.

## Eventos (exchange `capsur.events`, tipo topic)

| Routing key                  | Productor          | Consumidor                                                                    | Payload                        |
| ---------------------------- | ------------------ | ----------------------------------------------------------------------------- | ------------------------------ |
| `lead.created.v1`            | leads-service      | crm-bridge-service (colas `crm-bridge.lead-created` y `crm-bridge.meta-capi`) | `LeadCreatedPayload`           |
| `lead.feedback.v1`           | leads-service      | crm-bridge-service (`crm-bridge.lead-feedback`)                               | `LeadFeedbackPayload`          |
| `lead.anonymized.v1`         | leads-service      | crm-bridge-service (`crm-bridge.lead-anonymized`)                             | `LeadAnonymizedPayload`        |
| `crm.contact.synced.v1`      | crm-bridge-service | leads-service                                                                 | `CrmContactSyncedPayload`      |
| `crm.conversation.linked.v1` | crm-bridge-service | leads-service                                                                 | `CrmConversationLinkedPayload` |
| `crm.sync.failed.v1`         | crm-bridge-service | leads-service                                                                 | `CrmSyncFailedPayload`         |

Sobre común `EventEnvelope`: `{ id (uuid), name, version, occurredAt, producer, correlationId (leadId), payload }`. Los consumidores guardan `id` en `processed_events` y descartan repetidos. Un cambio incompatible crea `…v2` y mantiene `…v1` hasta migrar a todos los consumidores.

Topología, reintentos y DLQ: [`../diagrams/c4.md`](../diagrams/c4.md#topología-de-mensajería-detalle-del-nivel-2) e `infrastructure/rabbitmq/definitions.json`. Cada servicio se conecta con su propio usuario de RabbitMQ y solo hace `checkQueue` (no declara topología).
