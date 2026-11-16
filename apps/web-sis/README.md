# web-sis

Landing de captación de **IEST Privado Sistemas del Sur (SIS)**: hero, selector de promociones y especialidades, formulario de catálogo y salida a WhatsApp, más páginas de especialidad, Libro de Reclamaciones y derechos ARCO. Next.js 16 (App Router) + React 19 + Tailwind CSS 4.

## Qué hace

- **Catálogo**: promociones y especialidades de `promotions-service`, leídas en el servidor con `fetch(..., { next: { tags: ['catalog'], revalidate: 300 } })`. Si el servicio no responde se usa el catálogo de respaldo (`src/lib/fallback-catalog.ts`); el backend vuelve a validar al registrar. `POST /api/revalidate` (cabecera `x-revalidate-secret`, cuerpo `{"tags":["catalog"]}`) invalida la caché al momento (B8).
- **Registro** (`POST /api/v1/leads`): `Idempotency-Key` (UUID), honeypot, Turnstile opcional, atribución UTM, consentimiento versionado, especialidades elegidas (`specialtyIds`), sede (`campus`) y experimento A/B (`experiment`). Guarda `statusToken` y lo envía en `x-lead-token` al consultar el estado y en la encuesta (C18).
- **Tras registrar**: estados verificables (registro confirmado → WhatsApp → sincronización real con el CRM) y la pregunta opcional «¿Cómo nos conociste?» (`POST /api/v1/leads/:id/feedback`).
- **Sesión** (A15): borrador del formulario en `sessionStorage` (se borra tras el envío exitoso) y restauración de la confirmación si el usuario recarga o vuelve en la misma pestaña.
- **Experimento `hero-copy`** (A18): variante `a` (texto aprobado) o `b` («Especialízate con IA, 100% virtual.»), asignada por FNV-1a de `hero-copy:<sessionId>`. Un script en línea con nonce marca `<html data-exp-hero-copy>` antes del primer pintado (sin parpadeo ni CLS). Evento `experiment_exposed` una vez por sesión. Se desactiva con `NEXT_PUBLIC_EXPERIMENTS_ENABLED=false`.
- **Eventos de tracking** sin datos personales: `landing_viewed`, `promotion_selected`, `form_started`, `form_submitted`, `whatsapp_opened`, `experiment_exposed`, `faq_opened`, `call_clicked`, `floating_cta_clicked`, `specialty_viewed`.

## Páginas

| Ruta | Contenido |
| --- | --- |
| `/` | Landing. `?promo=<id>` preselecciona la promoción (A30) |
| `/promociones/[id]` | La misma landing con la promoción preseleccionada, metadatos e imagen OG propios (A24, A30) |
| `/especialidades/[slug]` | Presentación, público objetivo, beneficios, temario y CTA; JSON-LD `Course` (A10). Rutas generadas desde el catálogo de respaldo; las nuevas del catálogo se resuelven en runtime |
| `/libro-de-reclamaciones` | Hoja de reclamación virtual (`ComplaintRequestSchema`); muestra código y fecha límite (A5) |
| `/derechos-arco` | Solicitud ARCO (`PrivacyRequestSchema`), enlazada desde la política (C9) |
| `/politica-de-privacidad` y `/versiones` | Política vigente e historial público de versiones (A28) |
| `/solicitud/[leadId]` | Reabre una confirmación de la misma sesión (o con `#token=` en el fragmento) |
| `/opengraph-image`, `/promociones/[id]/opengraph-image` | Imágenes Open Graph dinámicas (A24) |
| `/api/health`, `/api/revalidate` | Salud y revalidación del catálogo |

Secciones nuevas de la landing (mismo sistema visual: tarjetas blancas, Montserrat, azul de marca): selector de especialidades dentro de la promoción (A3), sede Tacna/Arequipa (A4), «Válida hasta el …» si la promoción tiene `validUntil` (A13), comparador de promociones con `<table>` y `<caption>` cargado bajo demanda (A26), próximos inicios (A23) y testimonios (A12) ocultos mientras su contenido esté vacío, preguntas frecuentes con `<details>` y JSON-LD `FAQPage` (A11), tarjeta de la sede con «Cómo llegar» (A25), sello de respaldo del CIP en «Nosotros» (A12), barra móvil «Solicitar catálogo» + «Llamar» cuando el formulario está fuera de pantalla (A14, A22) y enlace «Libro de Reclamaciones» en el pie (A5).

## Estructura

```
src/app/            rutas (ver tabla), proxy en src/proxy.ts, instrumentation(-client).ts (Sentry)
src/components/     secciones y formularios; forms/Field.tsx para los formularios legales
src/content/        contenido editorial: specialties (brochures), faq, institution, privacy-versions,
                    testimonials y start-dates (vacíos: sus secciones se ocultan)
src/lib/            api-client (único acceso HTTP), catalog (servidor), validación ligera, experimentos,
                    seguridad (CSP), sesión, tracking, formato
assets/             originales: fotos PNG y Montserrat variable (no se publican)
scripts/            subset-font, optimize-images, analyze, check-client-bundle
e2e/                Playwright: funcionales, axe, regresión visual (__screenshots__ versionados)
```

## Ejecutar en local

```bash
cp apps/web-sis/.env.example apps/web-sis/.env
pnpm --filter @capsur/web-sis dev
```

En desarrollo, `next.config.ts` reescribe `/api/v1/promotions`, `/api/v1/specialties`, `/api/v1/leads/*`, `/api/v1/tracking/*`, `/api/v1/complaints` y `/api/v1/privacy/*` hacia `PROMOTIONS_SERVICE_URL` y `LEADS_SERVICE_URL`. En producción ese enrutamiento lo hace el gateway (Traefik).

## Variables

| Variable | Uso |
| --- | --- |
| `PROMOTIONS_SERVICE_URL` | URL interna del catálogo (servidor Next y reescrituras) |
| `LEADS_SERVICE_URL` | URL interna de leads (reescrituras de desarrollo) |
| `REVALIDATE_SECRET` | Secreto de `POST /api/revalidate` (igual a `WEB_REVALIDATE_SECRET` de promotions-service). Desarrollo: `dev-revalidate-secret` |
| `NEXT_PUBLIC_API_BASE_URL` | Base de la API para el navegador; vacío = mismo origen. Si es otro origen se añade a `connect-src` |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | WhatsApp de captación en E.164 sin `+` |
| `NEXT_PUBLIC_PRIVACY_POLICY_VERSION` | Versión de la política aceptada en cada consentimiento (debe existir en `src/content/privacy-versions.ts`) |
| `NEXT_PUBLIC_SITE_URL` | URL pública (metadatos, sitemap). Si empieza por `https://` en producción se activan HSTS y `upgrade-insecure-requests` |
| `NEXT_PUBLIC_SHOW_MARKETING_CONSENT` | `1` muestra la casilla opcional de autorización publicitaria |
| `NEXT_PUBLIC_SOCIAL_*` | Redes del pie |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Activa Cloudflare Turnstile (`interaction-only`) en el formulario, el libro y ARCO; vacío = sin widget |
| `NEXT_PUBLIC_SENTRY_DSN` | Activa Sentry (cliente y servidor) sin PII y sin subir sourcemaps; vacío = desactivado (el SDK no entra en el bundle inicial) |
| `NEXT_PUBLIC_EXPERIMENTS_ENABLED` | `true`/`false` para el experimento del hero |

Las `NEXT_PUBLIC_*` se incrustan en el build: el `Dockerfile` (infraestructura) debe recibir como `ARG` las nuevas (`TURNSTILE_SITE_KEY`, `SENTRY_DSN`, `EXPERIMENTS_ENABLED`).

## Seguridad

- **CSP estricta con nonce por petición** (`src/proxy.ts`, C1): `default-src 'self'`; `script-src 'self' 'nonce-…' 'strict-dynamic'` (+ `'unsafe-eval'` solo en desarrollo); `style-src 'self' 'unsafe-inline'`; `img-src 'self' data: blob:`; `font-src 'self'`; `connect-src 'self'` (+ API externa, Sentry y Turnstile si están configurados); `frame-src https://challenges.cloudflare.com`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`; `object-src 'none'`; `upgrade-insecure-requests` en producción HTTPS. Next toma el nonce de la cabecera CSP de la petición; el JSON-LD, el script del experimento y Turnstile lo leen de `x-nonce`. Las páginas se renderizan por petición; los datos del catálogo siguen en la caché de datos.
- Cabeceras (C28): COOP y CORP `same-origin`, `X-DNS-Prefetch-Control: off`, `Permissions-Policy`, `X-Frame-Options`, `nosniff`, `Referrer-Policy` y HSTS en producción HTTPS.
- JSON-LD siempre con `safeJsonForScript` (C27). Zod no llega al navegador (B3): los componentes cliente solo usan `import type` del contrato y validación ligera propia; `pnpm check:bundle` lo verifica.

## Calidad

```bash
pnpm --filter @capsur/web-sis typecheck
pnpm --filter @capsur/web-sis lint
pnpm --filter @capsur/web-sis test          # Vitest + jsdom + Testing Library (unitarias y de componentes)
pnpm --filter @capsur/web-sis build
pnpm --filter @capsur/web-sis check:bundle  # tras el build: sin Zod en los chunks del navegador
pnpm --filter @capsur/web-sis test:e2e      # Playwright chromium + móvil, incluye axe (requiere build)
pnpm --filter @capsur/web-sis test:visual   # regresión visual 375/1024/1366 (requiere build)
pnpm --filter @capsur/web-sis analyze       # build webpack con @next/bundle-analyzer → .next/analyze/*.html
pnpm --filter @capsur/web-sis font:subset   # regenera el subconjunto de Montserrat
pnpm --filter @capsur/web-sis images:optimize
```

Los snapshots visuales se generan en Windows (`*-win32.png`); en CI Linux hay que generar los `*-linux.png` con `pnpm test:visual:update` en el mismo contenedor.

Pesos: `students.webp` 111 KB (antes PNG 1,5 MB, conserva transparencia), `campus.webp` 93 KB (antes 1,6 MB), Montserrat `Montserrat-latin.woff2` 55 KB (antes TTF 745 KB, pesos 300–800).

## Datos pendientes de confirmar con el cliente

Mientras falten, las secciones correspondientes se ocultan o derivan al asesor; no se inventa nada.

- **RUC** y razón social exacta del titular (Libro de Reclamaciones y política): `src/content/institution.ts` → `ruc`.
- **Horario de atención** de la sede Tacna: `institution.campus.tacna.openingHours`.
- **Dirección de la sede Arequipa** (el formulario ofrece la sede porque el contrato la admite; no se publica dirección).
- **Correo** para reclamaciones y protección de datos (`contactEmail`) y los datos entre corchetes de la política de privacidad.
- **Testimonios** reales con autorización escrita: `src/content/testimonials.ts`.
- **Fechas de inicio** confirmadas por el área académica: `src/content/start-dates.ts`.
- **Brochures** de «Gestión Integral de Bases de Datos con IA», «Administración de Redes y Comunicación de Datos» y «Computación e Informática» (los recibidos están vacíos), y el final del temario de Ciberseguridad 4.0 y Redes y Comunicaciones (texto truncado; las páginas lo indican como extracto). El temario se reconstruyó del texto extraído del PDF: revisar el orden de los temas.
- **Fecha de publicación** de la política 2026-11 (se usa 13/11/2026) y si la incorporación de sede, especialidades elegidas y variante de experimento al formulario requiere publicar una versión 2026-12 de la política.
- **Logotipo del CIP**: el sello usa texto con el sistema visual de la marca; usar el logotipo solo con autorización.
- **Precios de referencia** (`listPrice`) y vigencias (`validUntil`) reales en promotions-service: el comparador y las tarjetas los muestran automáticamente.
- Fotografías oficiales para reemplazar `assets/originals/*.png` (luego `pnpm images:optimize`).
