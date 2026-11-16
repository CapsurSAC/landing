# Flujo del formulario y Chatwoot

```mermaid
sequenceDiagram
  autonumber
  participant U as Usuario
  participant W as web-sis
  participant L as leads-service
  participant P as promotions-service
  participant MQ as RabbitMQ
  participant C as crm-bridge-service
  participant CW as Chatwoot

  U->>W: Elige promoción y completa el formulario
  W->>L: POST /api/v1/leads (Idempotency-Key)
  L->>L: Honeypot, validación Zod, normalización E.164
  L->>P: GET /internal/promotions/:id/validate
  P-->>L: { active, price, campaignId }
  L->>L: Transacción: lead + consentimiento + atribución + submission + outbox(lead.created.v1)
  L-->>W: 201 { reference, whatsapp.url, status: registered }
  W-->>U: "Solicitud registrada" + "Continuar por WhatsApp"
  L->>MQ: Relay del outbox publica lead.created.v1 (confirm)
  MQ->>C: crm-bridge.lead-created
  C->>CW: Buscar/crear contacto, atributos, etiquetas
  C->>MQ: crm.contact.synced.v1
  MQ->>L: leads.crm-status → status = crm_synced
  W->>L: GET /api/v1/leads/:id/status (sondeo breve)
  W-->>U: "Un asesor ya tiene tu solicitud"
  U->>CW: Envía el mensaje prellenado por WhatsApp
  CW->>C: Webhook message_created (token/HMAC)
  C->>C: Correlaciona por contacto o por código SIS-XXXXX
  C->>CW: Etiquetas y asignación en la conversación
  C->>MQ: crm.conversation.linked.v1
```

## Estados que ve el usuario

| Estado | Origen | Texto |
| --- | --- | --- |
| Registrada | Respuesta 201/200 del backend | "Solicitud registrada" + código |
| Continuar por WhatsApp | Acción del usuario (enlace `wa.me` con mensaje prellenado) | botón principal |
| Sincronizando | `status` = `registered` o `crm_syncing` | "Enviando tu solicitud a un asesor…" |
| Sincronizada | `status` = `crm_synced` (evento real) | "Un asesor ya tiene tu solicitud." |
| Sin confirmación | `crm_failed` o tiempo de espera agotado | "Tu solicitud está guardada. Te contactaremos…" |

La pantalla «Conectando con un asesor — 75 %» del diseño original se sustituyó por estos estados porque una barra simulada no representa ningún hecho del sistema. Registrar un formulario no abre una conversación de WhatsApp: la conversación nace cuando el usuario envía el mensaje. Para que la empresa inicie el contacto sin mensaje previo se necesita una plantilla aprobada y consentimiento específico (segunda etapa).

## Códigos de error de `POST /api/v1/leads`

| HTTP | `code` | Cuándo |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Campos inválidos (`errors[]` por campo) |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | Falta la cabecera |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Misma clave con un cuerpo distinto |
| 422 | `PROMOTION_NOT_AVAILABLE` | Promoción inexistente, inactiva o vencida |
| 429 | `RATE_LIMITED` | Demasiadas solicitudes por IP |
| 503 | `CATALOG_UNAVAILABLE` | promotions-service inalcanzable (con `Retry-After`) |
| 204 | — | Honeypot con contenido: no se persiste nada |
