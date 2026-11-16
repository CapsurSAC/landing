# ADR 0011 · Panel interno admin-web

**Estado:** aceptada · 2026-11-13

## Contexto

Las promociones se cargaban por semilla y los asesores no tenían una vista de leads, reclamaciones ni solicitudes ARCO (A1, A2, A5, C9). Hacía falta una herramienta interna sin abrir los servicios a Internet ni duplicar lógica de negocio.

## Decisión

- Nueva app **admin-web** (Next.js, puerto 3004) que **no tiene base de datos propia**: es un cliente de los endpoints `/internal/admin/*` y `/internal/reports/*` de los servicios, autenticándose con su token de llamador (`PROMOTIONS_SERVICE_TOKEN`, `LEADS_SERVICE_TOKEN`, `CRM_BRIDGE_SERVICE_TOKEN`) y enviando `x-actor` con el correo de la persona (ADR 0010).
- Usuarios y roles en `ADMIN_USERS_JSON` (correo, nombre, rol y hash bcrypt generado con `pnpm --filter @capsur/admin-web hash-password`). Sesión en cookie `HttpOnly`, `SameSite=Strict`, `Secure` en producción (`ADMIN_COOKIE_SECURE`), JWT HS256 firmado con `ADMIN_SESSION_SECRET` (≥ 32 caracteres). El rol se revalida en cada petición contra `ADMIN_USERS_JSON`, de modo que quitar a alguien del JSON revoca su acceso al redesplegar.
- Exposición: host propio (`admin.<dominio>`), allowlist de IP opcional en el gateway, `noindex`, CSP con nonce y cabeceras estrictas en la app.
- Funciones: promociones y especialidades (con revalidación del catálogo, ADR 0008), leads con filtros y exportación CSV (máx. 10 000 filas), anonimización, libro de reclamaciones, solicitudes ARCO, embudo y estado de integraciones/colas.
- Mismo patrón de contenedor que web-sis: Next standalone, usuario `node`, `read_only` con `tmpfs` en `.next/cache`.

## Consecuencias

- Sin base propia no hay otra copia de datos personales que custodiar; el descifrado ocurre en leads-service y solo viaja al panel por la red interna.
- La gestión de usuarios por variable es suficiente para un equipo pequeño; si crece (> 15 personas o necesidad de MFA/SSO), migrar a un proveedor OIDC (Google Workspace del grupo) con una ADR nueva.
- Cada exportación CSV y cada anonimización quedan auditadas en el servicio que las ejecuta.
- El panel depende de la disponibilidad de los servicios; muestra avisos por servicio caído en lugar de fallar entero.
