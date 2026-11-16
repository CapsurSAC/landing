# ADR 0007 · Gateway de borde y exposición de rutas

**Estado:** aceptada · 2026-11-13

## Contexto

La plataforma tiene cinco procesos HTTP (web-sis, admin-web y tres servicios Nest). El navegador solo debe hablar con un origen, los endpoints `/internal/*` (salud, Swagger, administración, reproceso) nunca deben ser alcanzables desde Internet y necesitamos límites homogéneos (tamaño de cuerpo, tasa, tiempos de espera, cabeceras de seguridad y compresión) sin repetirlos en cada servicio. El panel interno maneja datos personales y no debe compartir dominio con la landing pública.

## Decisión

- Un único gateway Traefik v3 en el borde. Configuración versionada:
  - `infrastructure/docker/traefik/dynamic.yml` (local/staging, entrypoint `web` :8080).
  - `infrastructure/docker/traefik/dynamic.prod.yml` (producción: `websecure` :443, ACME, HSTS, TLS ≥ 1.2 con suites AEAD, `sniStrict`).
  - En EasyPanel se replican las mismas reglas en su Traefik (ver `infrastructure/deployment/easypanel.md`).
- Rutas públicas por prefijo en el dominio de la landing:
  - `/api/v1/promotions`, `/api/v1/specialties` → promotions-service.
  - `/api/v1/leads`, `/api/v1/tracking`, `/api/v1/complaints`, `/api/v1/privacy` → leads-service.
  - `/webhooks/chatwoot` → crm-bridge-service.
  - Todo lo demás → web-sis.
- admin-web vive en un **host separado** (`admin.<dominio>`, `admin.localhost` en local) con allowlist de IP opcional (`ADMIN_IP_ALLOWLIST`, CIDR separados por comas) y `X-Robots-Tag: noindex`.
- Un router de prioridad máxima responde **403** a `/internal/*` y `/api/revalidate` en cualquier host. promotions-service llama a `web-sis:3000/api/revalidate` por la red interna.
- Middlewares comunes: `buffering` con `maxRequestBodyBytes` 1 MB en API, webhook y panel; `rateLimit` por grupo (leads 10/min por IP, catálogo 60/min, webhook 120/min); `compress` (Brotli y gzip, ≥ 1 KB) en catálogo, web y panel (B9); cabeceras de seguridad (`frameDeny`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP, `X-DNS-Prefetch-Control: off`, `browserXssFilter: false` porque `X-XSS-Protection` está obsoleto); `serversTransport` con tiempos de espera (5 s conexión, 30 s cabeceras).
- El router de la landing **no** usa `buffering` para no romper el streaming de Next (RSC/HTML progresivo); Next aplica su propio límite de cuerpo.
- Las plantillas Go del file provider (`{{ env "ADMIN_HOST" }}`) permiten parametrizar hosts y allowlist sin duplicar archivos por entorno.

## Consecuencias

- Los servicios no necesitan CORS en producción (mismo origen); siguen validando `CORS_ORIGINS` por defensa en profundidad.
- Un error de configuración del gateway afecta a todo: los cambios a `dynamic*.yml` se validan arrancando un Traefik desechable (ver README de infraestructura) y en staging antes de producción.
- El límite de tasa del gateway es por instancia de Traefik; el límite de negocio distribuido (Redis, por IP y por teléfono) vive en leads-service (C2).
- Si EasyPanel antepone su propio proxy, la allowlist del panel debe usar `ipStrategy.depth` o confiar en `X-Forwarded-For` solo desde la IP del proxy.
