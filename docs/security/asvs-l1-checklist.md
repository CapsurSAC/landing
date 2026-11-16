# Checklist OWASP ASVS nivel 1 (C29)

Revisión manual previa a producción y tras cambios mayores, complementaria al escaneo automático **OWASP ZAP baseline** (`.github/workflows/zap-baseline.yml`, contra `STAGING_URL`). Basada en ASVS 4.0.3 nivel 1, agrupada por capítulo y adaptada a la plataforma. Marcar `[x]` con evidencia (enlace a PR, prueba o captura) y fecha.

Leyenda de alcance: **W** web-sis · **A** admin-web · **S** servicios Nest · **G** gateway · **I** infraestructura.

## V1 · Arquitectura

- [ ] Diagramas C4 y ADR al día (docs/diagrams/c4.md, ADR 0007–0011). _(I)_
- [ ] Todos los componentes con dependencias fijadas y escaneadas (Renovate, Trivy, OSV). _(I)_

## V2 · Autenticación (panel)

- [ ] Contraseñas de ≥ 12 caracteres, sin reglas de composición forzadas, comprobadas contra filtraciones comunes al crearlas. _(A)_
- [ ] Hash bcrypt (coste ≥ 10) en `ADMIN_USERS_JSON`; nunca contraseñas en claro. _(A)_
- [ ] Límite de intentos de inicio de sesión por cuenta e IP. _(A)_
- [ ] Mensajes de error de login genéricos (no revelan si el correo existe). _(A)_
- [ ] Sin credenciales por defecto en ningún entorno desplegado. _(A, I)_

## V3 · Sesiones

- [ ] Cookie de sesión `HttpOnly`, `Secure`, `SameSite=Strict`, con caducidad absoluta e inactividad. _(A)_
- [ ] Cerrar sesión invalida la cookie; rotar `ADMIN_SESSION_SECRET` invalida todas. _(A)_
- [ ] El rol se revalida en cada petición (usuario retirado = sin acceso). _(A)_

## V4 · Control de acceso

- [ ] `/internal/*` exige token de llamador salvo `/internal/health`; probado con y sin token. _(S)_
- [ ] El gateway devuelve 403 en `/internal/*` y `/api/revalidate` desde Internet. _(G)_
- [ ] Roles del panel aplicados en servidor (no solo ocultando botones). _(A)_
- [ ] `GET /api/v1/leads/:id/status` y `/feedback` exigen `x-lead-token`; 404 idéntico si falta o no coincide. _(S)_
- [ ] Usuarios de RabbitMQ y Redis con permisos mínimos verificados. _(I)_

## V5 · Validación, saneamiento y codificación

- [ ] Toda entrada validada con esquemas Zod en servidor (cuerpo, query, params, cabeceras como `Idempotency-Key`). _(S)_
- [ ] Límite de cuerpo 100 KB en servicios y 1 MB en gateway; 415 ante `Content-Type` no JSON. _(S, G)_
- [ ] JSON-LD serializado con `safeJsonForScript`. _(W)_
- [ ] Consultas solo vía Prisma (sin SQL dinámico concatenado). _(S)_
- [ ] Exportación CSV protegida contra inyección de fórmulas (prefijo `'` en celdas que empiezan por `= + - @`). _(S)_

## V6 · Criptografía almacenada

- [ ] PII cifrada con AES-256-GCM; claves fuera del repositorio y distintas por entorno (ADR 0009). _(S)_
- [ ] Hashes HMAC con clave para búsqueda; IP solo como hash con pimienta. _(S)_
- [ ] Copias de seguridad cifradas con clave pública; privada fuera del servidor. _(I)_

## V7 · Errores y registro

- [ ] Respuestas de error en formato problem-details sin trazas ni detalles internos. _(S)_
- [ ] Logs sin datos personales (redacción de nest-kit probada) ni secretos (query `token` del webhook). _(S, G)_
- [ ] Acciones administrativas registradas en `audit_log` con llamador y actor. _(S)_
- [ ] Sentry con `beforeSend` que elimina PII. _(W, A, S)_

## V8 · Protección de datos

- [ ] Política de privacidad publicada y versionada; consentimiento append-only. _(W, S)_
- [ ] Retención y anonimización activas (docs/security/data-retention-and-arco.md). _(S)_
- [ ] Respuestas del panel con `Cache-Control: no-store` en datos personales. _(A)_
- [ ] Redis sin persistencia; sin PII en Redis. _(I)_

## V9 · Comunicaciones

- [ ] TLS ≥ 1.2 con suites AEAD en el borde; HSTS de un año. _(G)_
- [ ] Postgres exige TLS (`hostssl`) y SCRAM; superusuario sin acceso por red. _(I)_
- [ ] Llamadas salientes (Chatwoot, Meta, Turnstile, SMTP) por HTTPS/TLS con verificación de certificado. _(S)_

## V10 · Código malicioso

- [ ] `gitleaks` en cada PR; sin secretos en el historial. _(I)_
- [ ] Dependencias con edad mínima de 14 días (Renovate) y auditoría semanal. _(I)_

## V11 · Lógica de negocio

- [ ] Límite por IP (10/min, Redis) y por teléfono (5/h) en `POST /api/v1/leads`. _(S)_
- [ ] Turnstile activo en producción. _(W, S)_
- [ ] `Idempotency-Key` UUID con alcance de IP. _(S)_
- [ ] Precio y promoción validados en servidor (ADR 0006). _(S)_

## V12 · Archivos y recursos

- [ ] La plataforma no acepta subida de archivos; si se añade, revisar este capítulo completo. _(W, A, S)_
- [ ] `CHATWOOT_BASE_URL` validada contra allowlist (anti-SSRF) y tiempos de espera en clientes HTTP. _(S)_

## V13 · API

- [ ] Swagger desactivado en producción (o con token). _(S)_
- [ ] CORS restringido a los orígenes propios. _(S)_
- [ ] Webhook de Chatwoot con token rotado, allowlist de IP y límites (docs/security/chatwoot-webhooks.md). _(S, G)_

## V14 · Configuración

- [ ] CSP con nonce y `frame-ancestors 'none'`; cabeceras de seguridad presentes (ZAP sin FAIL). _(W, A, G)_
- [ ] Contenedores `read_only`, `cap_drop: ALL`, `no-new-privileges`, usuario no root y límites de recursos. _(I)_
- [ ] Infraestructura sin puertos publicados en producción (solo 80/443). _(I)_
- [ ] Imágenes sin CVE CRITICAL corregibles (Trivy) y SBOM archivado. _(I)_

## Registro de revisiones

| Fecha | Versión/commit | Revisor | Resultado | Pendientes |
| ----- | -------------- | ------- | --------- | ---------- |
|       |                |         |           |            |
