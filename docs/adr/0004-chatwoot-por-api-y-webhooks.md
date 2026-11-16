# ADR 0004 · Chatwoot como sistema externo integrado por API y webhooks

**Estado:** aceptada · 2026-11-13

## Contexto

Ya existe un Chatwoot operativo con la integración de WhatsApp Cloud API y los asesores trabajando en él. Tocar su código o su base de datos ataría la plataforma a una versión concreta y complicaría las actualizaciones.

## Decisión

`crm-bridge-service` habla con Chatwoot solo por su API REST (`api_access_token`) y recibe sus webhooks. Guarda su propio mapeo lead ↔ contacto ↔ conversación. La autenticidad del webhook se garantiza con un token secreto en la URL (Chatwoot no firma webhooks de forma nativa) y, opcionalmente, HMAC-SHA256 del cuerpo cuando un proxy lo añade.

Para iniciar la conversación se usa el enlace `wa.me` con mensaje prellenado: la conversación nace cuando el usuario envía el mensaje. Mensajes iniciados por la empresa requieren plantillas aprobadas y consentimiento específico (fuera de la v1).

## Consecuencias

- Chatwoot se actualiza sin afectar a la plataforma.
- Una caída de Chatwoot no impide registrar solicitudes: los eventos esperan en RabbitMQ con reintentos y DLQ.
- Antes de producción hay que verificar `account_id`, `inbox_id` y token reales; son configuración, no código.
