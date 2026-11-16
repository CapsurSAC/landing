# Webhooks de Chatwoot (C7)

Chatwoot (autoalojado) envía webhooks de cuenta sin firma criptográfica configurable. `/webhooks/chatwoot` es la única ruta de crm-bridge expuesta a Internet (ADR 0007), así que se protege por capas.

## 1. Token en la URL con rotación

- URL registrada en Chatwoot: `https://<dominio>/webhooks/chatwoot?token=<CHATWOOT_WEBHOOK_SECRET>`.
- crm-bridge compara el token en tiempo constante contra `CHATWOOT_WEBHOOK_SECRET` y, si existe, contra `CHATWOOT_WEBHOOK_SECRET_PREVIOUS`. Respuesta idéntica (401) ante token ausente o inválido; se cuenta como métrica y alerta (Sentry, C23).
- El gateway no registra la query string en los logs de acceso (`accesslog.fields.headers.defaultmode=drop`; revisar también que el formato de log no incluya `RequestPath` completo con query, o filtrarla). Los logs de la app redactan `token`.
- **Rotación trimestral sin corte:**
  1. Generar un token nuevo (`openssl rand -hex 32`).
  2. En crm-bridge: `CHATWOOT_WEBHOOK_SECRET_PREVIOUS=<actual>`, `CHATWOOT_WEBHOOK_SECRET=<nuevo>`; redesplegar.
  3. En Chatwoot (Configuración → Integraciones → Webhooks): editar la URL con el token nuevo.
  4. Verificar en logs que llegan eventos con el token nuevo; tras 24 h, vaciar `CHATWOOT_WEBHOOK_SECRET_PREVIOUS` y redesplegar.

## 2. Allowlist de IP

- `WEBHOOK_IP_ALLOWLIST` (CIDR o IPs separadas por comas) en crm-bridge: solo se aceptan webhooks desde la IP de salida del servidor de Chatwoot. Vacío = sin filtro (solo desarrollo).
- crm-bridge confía en `X-Forwarded-For` únicamente porque está detrás del gateway (`trust proxy`); el gateway sobrescribe la cabecera con la IP real del cliente.
- Opcional en el borde: añadir un middleware `ipAllowList` al router `chatwoot-webhook` en `dynamic.prod.yml` con la misma IP (doble barrera).
- Si Chatwoot cambia de servidor, actualizar la allowlist antes de migrar.

## 3. Opción: proxy que firma con HMAC

Para eliminar el secreto de la URL (que puede quedar en logs de Chatwoot o de proxies intermedios):

```
Chatwoot ──(red privada / localhost)──▶ firmador ──HTTPS + X-Signature──▶ /webhooks/chatwoot
```

- Un proxy mínimo **en el mismo host/red que Chatwoot** (p. ej. un contenedor Caddy/Nginx con un script, o un worker de n8n) recibe el webhook por red privada, calcula `X-Signature: sha256=HMAC_SHA256(CHATWOOT_WEBHOOK_HMAC_SECRET, timestamp + "." + body)` y `X-Signature-Timestamp`, y lo reenvía.
- crm-bridge verifica firma y ventana de tiempo (±5 min, anti-replay) y deja de aceptar `?token=` cuando el proxy está activo.
- El secreto HMAC nunca sale de los dos servidores y no aparece en ninguna URL.
- Requiere soporte en crm-bridge (variable `CHATWOOT_WEBHOOK_HMAC_SECRET`); queda como evolución, no implementado en la v2.

## 4. Robustez del receptor

- Idempotencia por id de evento (`webhook_events`), respuesta 202 inmediata y procesamiento asíncrono.
- Límite de tasa en el gateway (120/min) y de cuerpo (1 MB).
- Esquema Zod estricto del payload; campos desconocidos se ignoran, nunca se reflejan.
- Alertas: picos de 401/403 en `/webhooks/chatwoot` (posible sondeo o token filtrado → rotar).
