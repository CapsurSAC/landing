# Propuestas de mejora (backlog)

Fecha: 2026-11-13. Prioridad: 🔴 alta · 🟡 media · 🟢 baja. Cada ítem referencia la parte del sistema a la que aplica.

## A. Mejoras de producto y funcionalidad

1. 🔴 Panel de administración de promociones (`admin-web`, fase 2) con roles, vigencias y vista previa de la landing.
2. 🔴 Vista de leads para asesores: estado CRM, promoción, campaña, filtros y exportación, leyendo de leads-service.
3. 🔴 Selector de especialidades dentro de la promoción elegida (la 2×1 y el Pack IA Pro incluyen 2) y envío de esa elección en el lead.
4. 🔴 Confirmar sede (Tacna / Arequipa) en el formulario y enrutar la conversación a la bandeja de Chatwoot correspondiente.
5. 🔴 Libro de reclamaciones y términos de servicio (obligatorios en Perú para servicios educativos) enlazados desde el pie.
6. 🔴 Envío automático del catálogo PDF por plantilla aprobada de WhatsApp cuando el usuario no escribe en 24 h (requiere consentimiento específico).
7. 🟡 Correo de confirmación con el código de solicitud y el enlace de WhatsApp (respaldo si el usuario no abre el chat).
8. 🟡 Respuesta automática en Chatwoot al detectar el código `SIS-XXXXX`: catálogo + nombre del asesor asignado.
9. 🟡 Asignación inteligente por carga real de asesores (usando el gestor de asesores) en lugar de round-robin fijo.
10. 🟡 Página por especialidad (`/especialidades/[slug]`) con temario del brochure, duración, docentes y SEO propio.
11. 🟡 Sección de preguntas frecuentes con `FAQPage` en JSON-LD (modalidad, certificación, pagos, inicio).
12. 🟡 Testimonios de egresados y sellos de respaldo (CIP, licenciamiento MINEDU) junto al hero y en «Nosotros».
13. 🟡 Mostrar vigencia real de cada promoción («válida hasta el 30 de noviembre») desde `validUntil` del catálogo.
14. 🟡 Botón flotante de WhatsApp/«Solicitar catálogo» en móvil cuando el formulario sale de pantalla.
15. 🟡 Guardar borrador del formulario en `sessionStorage` y restaurar la confirmación si el usuario ya registró en la sesión.
16. 🟡 Dashboard de embudo (analytics-service): vistas → promoción elegida → envío → WhatsApp abierto → sincronizado → conversación.
17. 🟡 Integración con Meta Conversions API (evento `Lead` del lado servidor) condicionada al consentimiento.
18. 🟡 Pruebas A/B de hero y orden de promociones, asignadas por `sessionId` y medidas con los eventos de tracking.
19. 🟡 Plantilla multi-marca: misma landing parametrizada por `brand` (tokens de color, logos, catálogo) para Avanti, Globalex e IGE.
20. 🟡 Reporte diario interno (Slack o WhatsApp del equipo) con leads nuevos, duplicados y sincronizaciones fallidas.
21. 🟢 Pregunta opcional «¿Cómo nos conociste?» tras el registro, sin bloquear el flujo.
22. 🟢 Botón «Llamar» con la central 052-350006 visible solo en móvil.
23. 🟢 Calendario de inicios de clase con recordatorio por WhatsApp (plantilla) a quienes lo pidan.
24. 🟢 Imágenes Open Graph dinámicas por promoción para compartir enlaces con la oferta concreta.
25. 🟢 Mapa y datos de la sede (Calle Deustua 270, Tacna) con horario de atención.
26. 🟢 Comparador de promociones (qué incluye cada una) en una tabla accesible.
27. 🟢 Página de estado del servicio (`/estado`) para el equipo, con salud de los servicios y colas.
28. 🟢 Versionado público de la política de privacidad con historial de cambios.
29. 🟢 Auditoría de accesibilidad AA con axe en CI y revisión manual con lector de pantalla.
30. 🟢 Modo «campaña»: parámetro `?promo=con-ia` que preselecciona la promoción desde anuncios.

## B. Optimización y calidad de código

1. 🔴 Reducir las imágenes fuente: `students.png` (1,5 MB) y `campus.png` (1,6 MB) a WebP/AVIF de menos de 300 KB.
2. 🔴 Subsetear Montserrat (latín) para bajar de 745 KB a ~100 KB y precargar solo los pesos usados.
3. 🔴 Sacar `zod` completo del bundle del navegador: validar en `LeadForm` con `zod/mini` o reglas ligeras y dejar el esquema completo al servidor.
4. 🔴 Extraer `ZodValidationPipe`, `ProblemDetailsFilter`, health y logging (duplicados en los tres servicios) a un paquete `@capsur/nest-kit`.
5. 🔴 Extraer `RabbitMqConnection` y `RabbitMqPublisher` (duplicados en leads y crm-bridge) al mismo paquete.
6. 🔴 Ejecutar `prisma migrate deploy` como job previo al despliegue, no en el arranque del contenedor.
7. 🔴 Lighthouse CI con presupuestos: LCP móvil ≤ 2,5 s, CLS < 0,1, JS inicial < 150 KB.
8. 🟡 Revalidación del catálogo por etiqueta (`revalidateTag`) disparada por promotions-service al cambiar una promoción, en lugar de solo cada 60 s.
9. 🟡 ETag y compresión Brotli en el gateway para `/api/v1/promotions` y `/api/v1/specialties`.
10. 🟡 Outbox: sustituir el sondeo fijo por `LISTEN/NOTIFY` de PostgreSQL o intervalo adaptativo; publicar en lote con confirmaciones.
11. 🟡 Pool de conexiones Prisma configurado por servicio y PgBouncer en producción.
12. 🟡 `select` explícito en los repositorios Prisma para no leer columnas innecesarias (p. ej. `responseSnapshot`).
13. 🟡 Cliente HTTP generado desde OpenAPI (`openapi-typescript`) para la web en lugar de `fetch` manual.
14. 🟡 Publicar el OpenAPI de cada servicio desde los esquemas Zod del contrato y validar compatibilidad en CI (tests de contrato).
15. 🟡 `@swc/jest` en lugar de `ts-jest` para acelerar las suites de los servicios.
16. 🟡 Caché remota de Turborepo y `turbo run --affected` para que CI solo construya lo cambiado.
17. 🟡 Pruebas de integración con Testcontainers (PostgreSQL + RabbitMQ) para repositorios, outbox y consumidores.
18. 🟡 Pruebas de carga con k6 sobre `POST /api/v1/leads` (objetivo p95 < 300 ms con 50 req/s).
19. 🟡 Caché de 5 s en los health checks y tiempos de espera por dependencia para no sobrecargar Postgres/Redis.
20. 🟡 Apagado ordenado completo: cancelar consumidores, esperar mensajes en vuelo y cerrar canales antes de salir.
21. 🟡 Transporte de pino fuera del event loop (`pino.transport` en worker) y muestreo de logs de health.
22. 🟡 Imágenes Docker más pequeñas: `pnpm deploy --prod`, usuario `node`, objetivo < 250 MB por servicio.
23. 🟡 `next/dynamic` para `LeadConfirmation` y el visor de estado (solo se cargan tras registrar).
24. 🟡 Analizador de bundle en CI (`@next/bundle-analyzer`) con umbral de alerta.
25. 🟢 Paquete `@capsur/config` con esquemas Zod de variables por servicio y `.env.example` generado automáticamente.
26. 🟢 Pre-commit con lint-staged (prettier + eslint) y commitlint; `changesets` para versionar servicios.
27. 🟢 Pruebas unitarias del formulario (`validateLeadForm`) y del `PromotionPicker` con React Testing Library.
28. 🟢 Pruebas visuales de regresión con Playwright (`toHaveScreenshot`) en los tres anchos (375, 1024, 1366).
29. 🟢 Índices de Postgres revisados con `EXPLAIN` sobre las consultas de duplicados y del relay de outbox.
30. 🟢 Documentar ADR 0007 (gateway) y 0008 (caché de catálogo) y añadir diagramas C4 nivel 2.

## C. Seguridad y cumplimiento

1. 🔴 Content-Security-Policy estricta con nonces (el JSON-LD y los scripts de Next) y `frame-ancestors 'none'`.
2. 🔴 Rate limiting distribuido en Redis (hoy por instancia) con límites por IP y por teléfono/correo hasheados.
3. 🔴 Turnstile (CAPTCHA accesible) en el formulario además del honeypot, activable por variable.
4. 🔴 Autenticación entre servicios: token de servicio o mTLS para `/internal/*` (leads → promotions, retry de crm-bridge).
5. 🔴 No exponer Postgres, Redis ni RabbitMQ al host en producción; red interna de Docker y credenciales distintas a `capsur/capsur`.
6. 🔴 Gestor de secretos (EasyPanel secrets, Doppler o Infisical) con rotación; `gitleaks` en CI para evitar fugas.
7. 🔴 Firma HMAC de los webhooks de Chatwoot mediante un proxy o automatización, allowlist de IP y rotación del token de URL.
8. 🔴 Cifrado de PII en reposo (teléfono y correo) con `pgcrypto` o cifrado en aplicación, más hash para detectar duplicados.
9. 🔴 Política de retención: job que anonimiza leads tras el plazo definido y procedimiento ARCO (acceso, rectificación, cancelación, oposición).
10. 🔴 Roles de base de datos de mínimo privilegio en producción: sin `CREATEDB`, rol de migraciones separado del rol de la app, TLS obligatorio.
11. 🟡 Registro de consentimiento inmutable (append-only, sin UPDATE/DELETE) y validación de la versión de política contra una lista permitida.
12. 🟡 Límite de tamaño del cuerpo JSON (100 KB) y rechazo de `Content-Type` distinto de JSON en los servicios Nest.
13. 🟡 Límite de cuerpo (1 MB), tiempos de espera y bloqueo de `/internal/*` en Traefik, además de HSTS y TLS 1.2+.
14. 🟡 Ocultar Swagger (`/internal/docs`) en producción o protegerlo con autenticación.
15. 🟡 Endurecer contenedores: `read_only`, `cap_drop: ALL`, `no-new-privileges`, límites de CPU/memoria.
16. 🟡 Escaneo de imágenes con Trivy y SBOM (CycloneDX) en CI; bloquear despliegue con CVE críticas.
17. 🟡 Dependabot/Renovate con `pnpm audit` y OSV-Scanner semanales; las versiones ya están fijadas.
18. 🟡 Token de acceso firmado para `GET /api/v1/leads/:id/status` (devuelto al crear) para impedir enumeración aunque se filtre un UUID.
19. 🟡 Vincular `Idempotency-Key` al hash de IP y exigir formato UUID para evitar reproducciones de terceros.
20. 🟡 Validar `CHATWOOT_BASE_URL` contra una allowlist y fijar tiempos de espera para evitar SSRF desde configuración errónea.
21. 🟡 Usuarios de RabbitMQ por servicio con permisos solo sobre sus colas y exchanges; TLS en AMQP.
22. 🟡 Redis con contraseña/ACL y sin persistencia de datos personales (solo claves de idempotencia con TTL).
23. 🟡 Sentry con limpieza de PII (`beforeSend`) y alertas por 5xx, fallos de firma de webhook y mensajes en DLQ.
24. 🟡 Auditoría de acciones internas: quién ejecutó `/internal/integrations/retry`, cuándo y sobre qué leads; tokens por persona, no compartidos.
25. 🟡 Copias de seguridad cifradas de las tres bases con prueba de restauración mensual y RPO/RTO documentados.
26. 🟡 Regla de lint que prohíba `console.log` con datos personales y prueba automática de que los logs redactan teléfono, correo y nombre.
27. 🟡 Escapar `<` en el JSON-LD (`dangerouslySetInnerHTML`) para evitar inyección si algún nombre de promoción contuviera HTML.
28. 🟢 Cabeceras COOP/COEP/CORP y `X-DNS-Prefetch-Control` en Next y gateway.
29. 🟢 OWASP ZAP baseline contra staging en CI y revisión manual con ASVS nivel 1 antes de producción.
30. 🟢 Plan de respuesta a incidentes de datos personales (notificación a la ANPD, plantilla de comunicación, responsables).
