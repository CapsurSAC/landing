# ADR 0010 · Autenticación entre servicios

**Estado:** aceptada · 2026-11-13

## Contexto

Hasta la v1, `/internal/*` se protegía solo por no estar expuesto en el gateway, y crm-bridge usaba un único `INTERNAL_API_TOKEN` compartido. Con admin-web aparecen operaciones sensibles (editar precios, exportar leads, anonimizar) y varios llamadores. Necesitamos saber **quién** llamó (servicio y persona), poder revocar a un llamador sin afectar a los demás y no depender solo de la red. mTLS sería más fuerte pero exige una PKI interna que EasyPanel no gestiona.

## Decisión

- Cada servicio acepta `Authorization: Bearer <token>` en `/internal/*` y lee `INTERNAL_API_TOKENS`, un JSON `{ "<llamador>": "<token>" }`. El guard común de `@capsur/nest-kit` compara en tiempo constante, identifica al llamador y lo deja en `request.caller`.
- Matriz de llamadores:

  | Servicio           | Llamadores                            |
  | ------------------ | ------------------------------------- |
  | promotions-service | `admin-web`, `leads-service`          |
  | leads-service      | `admin-web`                           |
  | crm-bridge-service | `admin-web`, `ops` (reproceso manual) |

- Cabecera opcional `x-actor` con el correo de la persona del panel; cada acción `/internal/admin/*` o de reproceso se registra en `audit_log` (`caller`, `actor`, `action`, `target`, `metadata`) y en el log con `audit: true` (C24).
- Excepción: `GET /internal/health` sin token (orquestador). Swagger desactivado en producción salvo `SWAGGER_ENABLED=true`, y aun así con token (C14).
- RabbitMQ aplica el mismo principio con usuarios por servicio y permisos mínimos (C21): `leads_svc` solo escribe en `capsur.events` y lee `leads.*`; `crm_bridge_svc` escribe en `capsur.events`, `capsur.events.dlx` y el exchange por defecto (para su DLQ) y lee `crm-bridge.*`. Ninguno puede declarar topología (`configure: ^$`); la gobierna `infrastructure/rabbitmq/definitions.json`.
- El gateway sigue bloqueando `/internal/*` (ADR 0007): la red es una segunda barrera, no la única.

## Consecuencias

- Revocar un llamador = quitar su entrada del JSON y redesplegar el servicio llamado. La rotación se hace con dos tokens válidos a la vez para el mismo llamador durante la ventana de cambio (ver docs/security/secrets.md).
- Los tokens son secretos de alta entropía (≥ 32 bytes) distintos por entorno; los valores `dev-*` de la spec solo valen en local.
- Si en el futuro se adopta un service mesh o mTLS, el guard puede aceptar ambos mecanismos durante la transición sin cambiar los contratos.
