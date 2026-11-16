# crm-bridge-service

Puente asíncrono entre la plataforma de captación de GRUPO CAPSUR y **Chatwoot** (CRM conversacional externo, integrado solo por API y webhooks; nunca se tocan sus tablas). Primera marca: IEST Privado Sistemas del Sur (`sis`).

## Qué hace

1. **Consume `lead.created.v1`** desde la cola `crm-bridge.lead-created` y sincroniza cada lead con Chatwoot: busca el contacto por teléfono (E.164), lo crea o lo actualiza, y le aplica etiquetas por marca, promoción, campaña y origen.
2. **Recibe webhooks de Chatwoot** (`/webhooks/chatwoot`) de forma autenticada y, cuando el usuario escribe por WhatsApp, **vincula la conversación con el lead** (por contacto o por el código de solicitud `SIS-XXXXX` del mensaje), etiqueta la conversación y la asigna según reglas configurables.
3. **Publica** en `capsur.events`: `crm.contact.synced.v1`, `crm.conversation.linked.v1` y `crm.sync.failed.v1`.
4. **Reintenta con idempotencia** (cola de reintento con TTL, DLQ, `processed_events`) y permite **reproceso manual** desde un endpoint interno.

Tiene base de datos propia (`crm_bridge`, Postgres) con: `sync_jobs`, `crm_contact_links`, `integration_attempts`, `processed_events`, `webhook_events`.

## Flujo

```
leads-service ──lead.created.v1──▶ capsur.events ──▶ crm-bridge.lead-created ──▶ LeadCreatedConsumer
                                                                                      │
                                              ┌───────────────────────────────────────┘
                                              ▼
                                   SyncLeadToChatwoot
                                   ├─ GET  /contacts/search?q=+51...   (coincidencia exacta por phone_number)
                                   ├─ POST /contacts  |  PUT /contacts/{id}
                                   ├─ GET  /contacts/{id}/labels  →  POST /contacts/{id}/labels (unión)
                                   ├─ crm_contact_links, integration_attempts, sync_jobs=SUCCEEDED, processed_events
                                   └─ publica crm.contact.synced.v1
          fallo 5xx/429/timeout/red ─▶ nack(requeue=false) ─▶ crm-bridge.lead-created.retry (TTL 30 s) ─▶ vuelve a capsur.events
          intentos ≥ MAX_SYNC_ATTEMPTS ─▶ sync_jobs=DEAD + capsur.events.dlx (crm-bridge.lead-created.dlq) + crm.sync.failed.v1 + ack
          fallo 4xx (≠429) ─▶ sync_jobs=FAILED + crm.sync.failed.v1 + ack

Chatwoot ──webhook──▶ POST /webhooks/chatwoot?token=… ──▶ HandleChatwootWebhook
                                   ├─ dedupe por dedupeKey (webhook_events)
                                   ├─ correlación: sender/contact id → crm_contact_links.crmContactId
                                   │               o código SIS-XXXXX en el primer mensaje → crm_contact_links.reference
                                   ├─ primera vez: guarda conversación/inbox, POST /conversations/{id}/labels,
                                   │               POST /conversations/{id}/assignments (reglas), publica crm.conversation.linked.v1
                                   └─ sin coincidencia → outcome "unmatched" (no es error)
```

El número de intento se lee de la cabecera `x-death` (rechazos previos desde la cola principal). La topología (exchanges, colas, TTL, DLX) la declara `infrastructure/rabbitmq/definitions.json`; el servicio solo hace `checkQueue`. Si RabbitMQ no está disponible al arrancar, el HTTP sigue funcionando y el consumidor se suscribe cuando la conexión se recupera (backoff 1 s → 30 s).

## Configuración del webhook en Chatwoot

Chatwoot **no firma** sus webhooks, así que la autenticidad se garantiza con un secreto en la URL:

1. En Chatwoot: *Configuración → Integraciones → Webhooks → Añadir webhook*.
2. URL: `https://<host-publico>/webhooks/chatwoot?token=<CHATWOOT_WEBHOOK_SECRET>` (usa HTTPS; el token viaja en la query y no debe aparecer en logs públicos).
3. Eventos a marcar: `conversation_created`, `message_created`, `conversation_updated`, `conversation_status_changed`.

Vía alternativa para proxies o automatizaciones que sí firman: cabecera `x-chatwoot-signature` con el HMAC-SHA256 (hex) del cuerpo crudo usando el mismo secreto. Ambas comparaciones son en tiempo constante. Sin token ni firma válidos el servicio responde **401** y **no persiste** el payload.

Respuesta: siempre **202** `{ accepted: true, outcome, reason? }` con `outcome ∈ linked | ignored | unmatched | error`. Solo se procesan los `message_created` con `message_type: "incoming"`; el resto se registra como `ignored`.

## Eventos

| Evento | Dirección | Cuándo |
| --- | --- | --- |
| `lead.created.v1` | consume | Nuevo lead desde la landing |
| `crm.contact.synced.v1` | publica | Contacto creado/actualizado y etiquetado en Chatwoot |
| `crm.conversation.linked.v1` | publica | Primera vez que una conversación de WhatsApp queda vinculada al lead |
| `crm.sync.failed.v1` | publica | Fallo permanente (4xx) o intentos agotados (DEAD) |

Sobre: `EventEnvelope` de `@capsur/api-contracts` con `producer: "crm-bridge-service"` y `correlationId = leadId`. Mensajes persistentes con confirmaciones.

Etiquetas aplicadas al contacto (y a la conversación al vincular): `marca-{brand}`, `promo-{promotionId}`, `campania-{campaignId}` (si existe) y `origen-landing`. Como Chatwoot reemplaza la lista completa, se envía la unión con las etiquetas ya existentes.

Atributos personalizados del contacto: `lead_reference`, `lead_id`, `brand`, `promotion_id`, `promotion_name`, `campaign_id`, `utm_source`, `utm_medium`, `utm_campaign`, `consent_privacy_version`, `consent_marketing`, `landing_submitted_at`.

## Reglas de asignación

Variable opcional `ASSIGNMENT_RULES_JSON`: array **ordenado**; la primera regla cuyo `match` coincide gana.

```json
[
  { "match": { "brand": "sis", "campaignId": "nov-2026" }, "agentIds": [12, 15] },
  { "match": { "brand": "sis", "promotionId": "con-ia" }, "teamId": 3 },
  { "match": { "brand": "sis" }, "teamId": 2 }
]
```

- `agentIds`: reparto round-robin (estado en memoria por regla; con varias réplicas el reparto es aproximado).
- `teamId`: asignación al equipo. Si una regla tiene ambos, mandan los agentes.
- Regla que coincide sin `teamId` ni `agentIds`: no se asigna (útil para excluir).
- Sin regla coincidente: `CHATWOOT_DEFAULT_TEAM_ID` si existe; si no, no se asigna.
- La asignación se hace con `POST /conversations/{id}/assignments` (`team_id` o `assignee_id`) y se guarda como `team:<id>` / `agent:<id>` en `crm_contact_links.assignedTo` y en el evento.

## Variables de entorno

| Variable | Obligatoria | Descripción |
| --- | --- | --- |
| `PORT` | no (3003) | Puerto HTTP |
| `NODE_ENV` | no | `development` activa `pino-pretty` |
| `LOG_LEVEL` | no (`info`) | Nivel de pino |
| `DATABASE_URL` | sí | Postgres propio (`crm_bridge`) |
| `RABBITMQ_URL` | sí | `amqp://usuario:clave@host:5672` |
| `CHATWOOT_BASE_URL` | sí | URL base de Chatwoot (sin `/api`) |
| `CHATWOOT_ACCOUNT_ID` | sí | `account_id` de la cuenta en Chatwoot |
| `CHATWOOT_INBOX_ID` | sí | `inbox_id` de la bandeja de WhatsApp de SIS |
| `CHATWOOT_API_ACCESS_TOKEN` | sí | Token de acceso (perfil → Access Token) de un usuario agente/administrador |
| `CHATWOOT_WEBHOOK_SECRET` | sí | Secreto del `?token=` y del HMAC |
| `CHATWOOT_DEFAULT_TEAM_ID` | no | Equipo por defecto cuando ninguna regla coincide |
| `ASSIGNMENT_RULES_JSON` | no | Reglas de asignación (ver arriba) |
| `MAX_SYNC_ATTEMPTS` | no (5) | Intentos antes de marcar DEAD y enviar a la DLQ |
| `INTERNAL_API_TOKEN` | sí | Bearer para `/internal/integrations/*` |

> **Antes de producción**: verificar en Chatwoot el `CHATWOOT_ACCOUNT_ID`, el `CHATWOOT_INBOX_ID` de la bandeja de WhatsApp SIS y que el `CHATWOOT_API_ACCESS_TOKEN` pertenezca a un usuario con permisos sobre esa cuenta. Mientras el token sea `change-me` o la URL sea de ejemplo (`*.example.com`), el servicio considera Chatwoot **no configurado**: `GET /internal/health` reporta `chatwoot: down` (`degraded`) y cada lead se trata como fallo reintentable hasta agotar intentos (terminan en DEAD/DLQ y se pueden reprocesar). Cambia también `CHATWOOT_WEBHOOK_SECRET` e `INTERNAL_API_TOKEN`.

## Endpoints

| Método y ruta | Auth | Descripción |
| --- | --- | --- |
| `POST /webhooks/chatwoot` | `?token=` o `x-chatwoot-signature` | Webhook de Chatwoot (202 / 401) |
| `GET /internal/health` | — | `{ status, service, version, checks: { database, rabbitmq, chatwoot }, timestamp }`. `database` caída → `down`; `rabbitmq` o `chatwoot` caídos → `degraded` |
| `POST /internal/integrations/retry` | `Authorization: Bearer INTERNAL_API_TOKEN` | Reproceso manual; cuerpo `{ leadId?, status?: "FAILED"\|"DEAD", limit? }`; responde `{ attempted, succeeded, failed }` |
| `GET /internal/integrations/jobs?status=&limit=` | Bearer | Lista de trabajos sin datos personales (`leadId, reference, status, attempts, lastError, updatedAt`) |
| `GET /internal/docs` / `/internal/docs-json` | — | Swagger |

Errores en formato problem-details (`{ type, title, status, detail?, code?, errors?, traceId }`), con `x-request-id` aceptado y propagado.

## Reproceso manual

```bash
# Todos los FAILED y DEAD (máx. 50)
curl -X POST http://localhost:3003/internal/integrations/retry \
  -H "Authorization: Bearer $INTERNAL_API_TOKEN" -H "content-type: application/json" -d '{}'

# Solo DEAD, hasta 200
curl -X POST http://localhost:3003/internal/integrations/retry \
  -H "Authorization: Bearer $INTERNAL_API_TOKEN" -H "content-type: application/json" \
  -d '{"status":"DEAD","limit":200}'

# Un lead concreto (cualquier estado; fuerza la resincronización)
curl -X POST http://localhost:3003/internal/integrations/retry \
  -H "Authorization: Bearer $INTERNAL_API_TOKEN" -H "content-type: application/json" \
  -d '{"leadId":"6f1d2c3e-8a4b-4c5d-9e6f-7a8b9c0d1e2f"}'

# Ver el estado
curl "http://localhost:3003/internal/integrations/jobs?status=DEAD&limit=20" -H "Authorization: Bearer $INTERNAL_API_TOKEN"
```

El reproceso usa el payload guardado en `sync_jobs` (no necesita el mensaje original). Si vuelve a fallar de forma reintentable, el trabajo recupera su estado anterior (FAILED/DEAD) con el nuevo `lastError`; el reproceso manual nunca marca DEAD por sí mismo. Los mensajes de la DLQ (`crm-bridge.lead-created.dlq`) quedan como evidencia; reprocesar desde la cola no es necesario.

## Desarrollo

```bash
pnpm infra:up                                                  # postgres, redis, rabbitmq (desde la raíz)
cp apps/crm-bridge-service/.env.example apps/crm-bridge-service/.env
pnpm --filter @capsur/crm-bridge-service db:generate
pnpm --filter @capsur/crm-bridge-service db:migrate            # prisma migrate deploy
pnpm --filter @capsur/crm-bridge-service dev
pnpm --filter @capsur/crm-bridge-service test                  # Jest con fakes en memoria (sin BD ni broker)
```

`db:migrate:dev` necesita que el usuario de Postgres pueda crear la base de datos sombra; con el usuario `crm_bridge` del stack local no puede, así que las migraciones nuevas se generan con `prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` (o `--from-migrations prisma/migrations --to-schema-datamodel ...` para incrementales) y se aplican con `db:migrate`.

Prueba rápida del webhook en local (el `.env.example` usa `change-me` como secreto):

```bash
curl -i -X POST "http://localhost:3003/webhooks/chatwoot" -H "content-type: application/json" -d '{"event":"message_created"}'                  # 401
curl -i -X POST "http://localhost:3003/webhooks/chatwoot?token=change-me" -H "content-type: application/json" \
  -d '{"event":"message_created","id":1,"message_type":"incoming","content":"Código de solicitud: SIS-7K3M2","sender":{"id":1,"type":"contact"},"conversation":{"id":1,"inbox_id":1}}'   # 202 outcome=unmatched
```

## Estructura

```
src/
├── config/          env.ts (Zod), app-config.module.ts, service-info.ts
├── domain/          contact-link, sync-job, assignment-policy, reference-extractor, integration-error, lead-labels, chatwoot-webhook
├── application/
│   ├── ports/       chatwoot-gateway, repositories, event-publisher, clock, logger, tokens
│   └── use-cases/   sync-lead-to-chatwoot, handle-chatwoot-webhook, retry-failed-syncs
├── infrastructure/  prisma/*, chatwoot/http-chatwoot-gateway, rabbitmq/{connection,publisher}, security/webhook-signature-verifier
└── presentation/
    ├── http/        chatwoot-webhook, internal-integrations, health, zod-validation.pipe, problem-details.filter, internal-token.guard
    └── consumers/   lead-created.consumer
test/fakes/          FakeChatwootGateway, repositorios en memoria, publicador y reloj falsos
```
