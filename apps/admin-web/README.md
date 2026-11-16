# admin-web — Panel interno CAPSUR

Panel interno de GRUPO CAPSUR para la primera marca, **IEST Privado Sistemas del Sur (SIS)**. Next.js 16 (App Router), React 19 y Tailwind 4. Puerto local **3004**.

Cubre las propuestas del backlog A1 (promociones), A2 (leads), A16 (embudo), A27 (estado) y la parte de panel de A5 (libro de reclamaciones), C9 (derechos ARCO) y C24 (auditoría de acciones internas). Ver `docs/architecture/v2-integration-spec.md` §2 y §3.

## Páginas

| Ruta | Qué hace | Rol |
| --- | --- | --- |
| `/` | Resumen: leads de hoy (`/internal/reports/daily`) y embudo de 7/30/90 días (`/internal/reports/funnel`) con barras SVG, % respecto al paso anterior, leads por día y tablas por promoción, campaña, «¿cómo nos conociste?» y experimentos A/B (tasa de envío por variante). | admin |
| `/leads` | Filtros (estado CRM, promoción, sede, campaña, fechas en hora de Lima, búsqueda exacta por referencia/correo/teléfono), paginación por URL, enlace `wa.me` y chip de estado. | admin, asesor |
| `/leads/export` | Descarga CSV con los mismos filtros (proxy en streaming a `/internal/admin/leads.csv`). | admin |
| `/leads/[id]` | Detalle: contacto, promoción y especialidades, CRM (enlaces a Chatwoot si se configura `CHATWOOT_APP_URL`), consentimiento y atribución. Acción **Anonimizar** con `<dialog>` nativo y opción de eliminar el contacto en Chatwoot. | ver: ambos · anonimizar: admin |
| `/promociones` | Lista (incluye inactivas, con estado Vigente/Programada/Vencida/Inactiva), crear, editar y desactivar. Formulario con todos los campos de `AdminPromotionInputSchema` (soles → céntimos, hora de Lima → ISO), vista previa de la tarjeta con el mismo estilo de la landing. | admin |
| `/promociones/especialidades` | Lista y edición de especialidades (`AdminSpecialtyInputSchema`). | admin |
| `/reclamaciones` | Libro de reclamaciones: estado, días restantes hasta `responseDueBy` (vencidas en rojo), detalle y formulario de respuesta. | admin |
| `/privacidad` | Solicitudes ARCO: estado, plazo, detalle y resolución (con opción de anonimizar los leads asociados). | admin |
| `/estado` | Salud y latencia de los tres servicios, resumen de integraciones (jobs, colas, último sync, Chatwoot), **Reprocesar fallidos** (FAILED y luego DEAD) y auditoría reciente unificada. | admin |
| `/login` | Inicio de sesión. «Salir» está en la barra lateral. | — |
| `/api/health` | Salud del propio panel (sin datos). | público |

## Roles

- **admin**: todo.
- **asesor**: solo `/leads` y el detalle de cada lead. No exporta ni anonimiza.

Los permisos están en `src/lib/roles.ts` y se comprueban **en el servidor** en cada página (`requirePermission`), acción (`authorizeAction`) y route handler. Ocultar botones es solo cosmético. En cada petición el rol se vuelve a leer de `ADMIN_USERS_JSON`: quitar a alguien de la lista o cambiar su rol surte efecto de inmediato, aunque tenga una sesión abierta.

## Variables de entorno

Ver `.env.example` (cópialo a `.env`).

| Variable | Uso |
| --- | --- |
| `ADMIN_SESSION_SECRET` | Secreto HS256 de la sesión, **mínimo 32 caracteres**. Si falta, el panel responde 500 con un mensaje claro. |
| `ADMIN_USERS_JSON` | `[{ "email", "name", "role": "admin" \| "asesor", "passwordHash" }]` (bcrypt). |
| `ADMIN_COOKIE_SECURE` | Opcional: `true`/`false` para forzar `Secure` + prefijo `__Host-`. Por defecto, solo con `NODE_ENV=production`. |
| `ADMIN_BRAND` | Marca (`sis`). |
| `PROMOTIONS_SERVICE_URL`, `LEADS_SERVICE_URL`, `CRM_BRIDGE_SERVICE_URL` | URLs internas (3001, 3002, 3003). |
| `PROMOTIONS_SERVICE_TOKEN`, `LEADS_SERVICE_TOKEN`, `CRM_BRIDGE_SERVICE_TOKEN` | Token del llamador `admin-web` en `INTERNAL_API_TOKENS` de cada servicio. |
| `SERVICE_TIMEOUT_MS` | Tiempo máximo por llamada (8 000 ms). |
| `CHATWOOT_APP_URL`, `CHATWOOT_ACCOUNT_ID` | Opcionales: enlaces al contacto y la conversación. |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT` | Opcionales: Sentry solo en servidor y sin PII. |

## Crear usuarios

```bash
pnpm --filter @capsur/admin-web hash-password "una-clave-larga-y-unica"
# o, para no dejarla en el historial de la terminal:
echo "una-clave-larga-y-unica" | pnpm --filter @capsur/admin-web hash-password
```

Copia el hash en `ADMIN_USERS_JSON` (una sola línea) y reinicia el panel. La clave debe tener al menos 12 caracteres; el coste bcrypt es 12.

**Ojo con los `$` del hash:** Next.js expande variables en los archivos `.env`. En `.env` escribe cada `$` como `\$` y pon el JSON entre comillas simples (así está el ejemplo). En Docker Compose, cada `$` va como `$$`. Si una variable del sistema y el `.env` definen a la vez `ADMIN_USERS_JSON`, Next también expande la del sistema: no mezcles ambos. En producción, define la variable solo en el entorno (gestor de secretos) y no incluyas `.env` en la imagen.

Usuario de desarrollo: `admin@capsur.local` / `cambia-esta-clave-123`.

## Desarrollo

```bash
pnpm --filter @capsur/admin-web dev          # http://localhost:3004
pnpm --filter @capsur/admin-web typecheck
pnpm --filter @capsur/admin-web lint
pnpm --filter @capsur/admin-web test         # node:test + tsx
pnpm --filter @capsur/admin-web build
pnpm --filter @capsur/admin-web test:e2e     # requiere build previo
```

Sin los servicios reales puedes usar el servidor simulado: `pnpm --filter @capsur/admin-web exec tsx e2e/mock-services.ts` (puertos 4101/4102/4103, tokens `e2e-admin-to-*`) y apuntar las URLs y tokens del `.env` a él.

Las pruebas e2e (Playwright, puerto 3104) arrancan ese mock y `next start` con su propio entorno (ignoran el `.env` local) y cubren: login fallido y correcto, redirección sin sesión, cabeceras de seguridad, resumen, filtro de leads y CSV, creación de promoción con vista previa, página de estado con reproceso y restricciones del rol asesor.

## Seguridad

- **Sesión**: JWT HS256 (`jose`) con emisor, audiencia y caducidad de 8 h; se rechaza cualquier otro algoritmo. Cookie `__Host-capsur_admin` (`capsur_admin` en desarrollo sin https), `HttpOnly`, `SameSite=Strict`, `Secure` en producción.
- **Login**: comparación bcrypt en tiempo similar exista o no el usuario (hash señuelo), mensaje genérico, bloqueo tras **5 fallos por correo+IP en 15 min** y 20 por IP. Destino `next` validado (solo rutas propias y permitidas al rol). Se registra en log de auditoría (sin contraseñas).
- **Proxy** (`src/proxy.ts`, el antiguo middleware en Next 16): redirige a `/login` sin sesión válida y aplica CSP estricta con nonce por petición (`script-src 'self' 'nonce-…' 'strict-dynamic'`, `style-src` con nonce, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`), `X-Robots-Tag: noindex`, COOP/CORP `same-origin`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`, `nosniff`. Sin `X-Powered-By`. Los gráficos usan atributos SVG (no `style` en línea) para respetar la CSP.
- **Servicios internos**: solo desde el servidor (`server-only`), con `Authorization: Bearer <token>` y `x-actor: <correo>`; las respuestas se validan con los esquemas Zod de `@capsur/api-contracts`. Un error de red, de tiempo de espera, HTTP o de contrato se muestra como aviso dentro de la página, nunca como pantalla de error. Los logs no incluyen la query (puede contener correos o teléfonos buscados).
- **Acciones**: cada acción de servidor vuelve a comprobar sesión y rol y valida su entrada con Zod; las de servidor de Next ya verifican el `Origin` (CSRF) y la cookie es `SameSite=Strict`. Las acciones sensibles (exportar, anonimizar, desactivar, responder, resolver, reprocesar) dejan un evento de auditoría en el log del panel, además del `audit_log` de cada servicio.
- **Sentry**: opcional y solo en servidor; `dataCollection` sin usuario, cookies, cabeceras, cuerpos ni query; `beforeSend` elimina además la petición.

## Limitaciones conocidas

- El bloqueo de intentos de login vive **en la memoria del proceso**: se pierde al reiniciar y no se comparte entre réplicas (con N réplicas el límite efectivo es N veces mayor). Para escalar, moverlo a Redis.
- La IP del login sale de `X-Forwarded-For`: el panel debe estar **siempre** detrás del gateway, que fija esa cabecera.
- Los usuarios viven en una variable de entorno: no hay alta/baja desde la interfaz ni recuperación de contraseña; los cambios requieren reiniciar el despliegue. Una sesión robada sigue siendo válida hasta caducar (8 h) salvo que se quite al usuario de la lista o se rote `ADMIN_SESSION_SECRET` (cierra todas las sesiones).
- Los contratos no definen `GET` por id para promociones, especialidades, reclamaciones ni solicitudes ARCO: el detalle se toma de la lista (reclamaciones y ARCO se recorren hasta 2 000 registros).
- No se pueden crear especialidades nuevas (el contrato solo define `PUT /internal/admin/specialties/:id`).
- Ids de promoción reservados por rutas del panel: `nueva` y `especialidades`.
- El panel no muestra el CSV en pantalla: lo transmite tal cual lo genera leads-service (máximo 10 000 filas).
