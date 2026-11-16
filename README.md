# capsur-lead-platform

Plataforma de captación educativa de **GRUPO CAPSUR**. Primera implementación: la landing de **IEST Privado Sistemas del Sur (SIS)** con promociones, formulario de catálogo y salida a WhatsApp, respaldada por microservicios independientes, integración asíncrona con Chatwoot y un panel interno (**admin-web**) para catálogo, leads, libro de reclamaciones y solicitudes ARCO.

Monorepositorio (pnpm Workspaces + Turborepo), **no** monolito de ejecución: cada servicio tiene su proceso, contenedor, base de datos y despliegue.

## Mapa del repositorio

```
apps/
  web-sis/               Landing Next.js 16 (:3000) · catálogo con revalidación por etiqueta, Turnstile, estados verificables
  admin-web/             Panel interno Next.js 16 (:3004) · promociones, leads, reclamaciones, ARCO, embudo, integraciones
  promotions-service/    NestJS (:3001) · catálogo comercial, precios y vigencias. Autoridad de precios
  leads-service/         NestJS (:3002) · leads con PII cifrada, consentimiento, reclamaciones, ARCO, outbox
  crm-bridge-service/    NestJS (:3003) · Chatwoot, Meta Conversions API, seguimiento WhatsApp, webhooks y reintentos
packages/
  api-contracts/         Contrato público (Zod + tipos + eventos). Solo contratos
  nest-kit/              Piezas transversales Nest (guard entre servicios, logging, health, RabbitMQ, PII, Sentry)
  config/                Esquemas Zod de variables de entorno y generación de .env.example
  eslint-config/         ESLint flat config compartida
  tsconfig/              Configuraciones TypeScript base
infrastructure/
  docker/                Compose local y de producción, Traefik, Postgres (roles), Redis (ACL), backups
  rabbitmq/              Topología (exchanges, colas quorum, reintentos, DLQ) y usuarios por servicio
  load/                  Prueba de carga k6 de POST /api/v1/leads
  scripts/               Prueba mensual de restauración de backups
  deployment/            Guía de despliegue en EasyPanel
  monitoring/            Señales, colas a vigilar y alertas
docs/
  architecture/          Visión general, convenciones, flujo del formulario, spec de integración v2
  adr/                   Decisiones de arquitectura (0001–0011)
  api/                   Contrato HTTP, eventos y OpenAPI por servicio
  diagrams/              C4 nivel 1 y 2 (Mermaid)
  security/              Secretos, webhooks, retención/ARCO, incidentes, checklist ASVS
  operations/            Backups, RPO/RTO y restauración
.github/workflows/       CI (afectados + caché remota), seguridad, auditoría de dependencias, ZAP, k6
```

## Requisitos

- Node.js 24 (mínimo 22) y pnpm 12 (`npm i -g pnpm`)
- Docker Desktop (Postgres 17, Redis 7, RabbitMQ 4, Traefik 3)

## Arranque en local

```bash
pnpm install                                    # instala dependencias y los hooks de git (husky)
cp .env.example .env
pnpm infra:up                                   # postgres, redis, rabbitmq (bases, usuarios y colas por servicio)

# una vez por app: variables, migraciones y semilla
for s in promotions-service leads-service crm-bridge-service web-sis admin-web; do cp apps/$s/.env.example apps/$s/.env; done
pnpm db:generate
pnpm db:migrate
pnpm --filter @capsur/promotions-service db:seed

pnpm dev                                        # todos los servicios, landing en :3000 y panel en :3004
```

Puertos locales: web 3000, promotions 3001, leads 3002, crm-bridge 3003, admin 3004, gateway 8080 (panel en `http://admin.localhost:8080`), RabbitMQ UI 15672 (`capsur` / `capsur`, solo panel; los servicios usan `leads_svc` y `crm_bridge_svc`).

Usuario del panel en local: genera un hash con `pnpm --filter @capsur/admin-web hash-password` y ponlo en `ADMIN_USERS_JSON`.

Stack completo en contenedores (como en staging): `pnpm stack:up`. Las migraciones corren como jobs previos (`promotions-migrate`, `leads-migrate`, `crm-bridge-migrate`) y los servicios esperan a que terminen; solo migraciones: `pnpm stack:migrate`.

Cambios de topología de RabbitMQ en caliente (sin reiniciar el broker):

```bash
curl -u capsur:capsur -H "content-type: application/json" -X POST \
  http://localhost:15672/api/definitions --data-binary @infrastructure/rabbitmq/definitions.json
# o: RABBITMQ_ADMIN_USER=capsur RABBITMQ_ADMIN_PASS=capsur RABBITMQ_KEEP_FILE_USERS=true pnpm rabbitmq:apply
```

## Comandos

| Comando                                                     | Qué hace                                                                 |
| ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` | Calidad por paquete (Turborepo, con caché)                               |
| `pnpm test:int`                                             | Pruebas de integración (Testcontainers: necesita Docker)                 |
| `pnpm test:e2e`                                             | E2E de la landing con Playwright                                         |
| `pnpm openapi:export`                                       | Exporta el OpenAPI de cada servicio a `docs/api/openapi/<servicio>.json` |
| `pnpm lhci`                                                 | Lighthouse CI local (tras `pnpm --filter @capsur/web-sis build`)         |
| `BASE_URL=http://host.docker.internal:3002 pnpm load:leads` | Carga k6: 50 req/s, p95 < 300 ms (solo local/staging)                    |
| `pnpm infra:config` · `pnpm infra:prod:config`              | Valida los compose local y de producción                                 |
| `pnpm stack:up` · `pnpm stack:migrate` · `pnpm stack:down`  | Stack completo en contenedores                                           |
| `pnpm changeset`                                            | Registra un cambio versionable (ver `.changeset/README.md`)              |

## Convenciones de git

- **Commits convencionales** (commitlint, hook `commit-msg`): `tipo(alcance): descripción`. Alcances: `web-sis`, `admin-web`, `promotions`, `leads`, `crm-bridge`, `contracts`, `nest-kit`, `config`, `infra`, `docs` (y `deps`, `ci`, `release` para automatizaciones). Ej.: `feat(leads): libro de reclamaciones`.
- **pre-commit**: lint-staged ejecuta Prettier y ESLint solo sobre los archivos preparados, con la configuración del paquete afectado.
- **Changesets** para versionar servicios (paquetes privados, sin publicar en npm).
- Los hooks se instalan con `pnpm install` (script `prepare`). Para desactivarlos puntualmente: `HUSKY=0`.

## CI/CD

- `ci.yml`: en PRs solo se valida lo afectado (`turbo run ... --affected`) con caché remota de Turborepo (`TURBO_TOKEN`/`TURBO_TEAM`); Lighthouse CI con presupuestos (LCP móvil ≤ 2,5 s, CLS < 0,1, JS ≤ 150 KB, accesibilidad ≥ 0,95); contratos OpenAPI comparados con la rama base (`oasdiff breaking`); integración con la infraestructura local; imágenes con Trivy (bloquea CVE CRITICAL corregibles) y SBOM CycloneDX.
- `security.yml`: gitleaks (`.gitleaks.toml`) y Trivy del repositorio.
- `dependency-audit.yml`: `pnpm audit --prod` y OSV-Scanner semanales; Renovate (`renovate.json`) agrupa actualizaciones con edad mínima de 14 días.
- `zap-baseline.yml` (manual/semanal, contra `STAGING_URL`) y `load-test.yml` (k6, manual).

## Cómo fluye una solicitud

1. El navegador carga las promociones desde `promotions-service` (caché por etiqueta `catalog`, revalidada cuando el panel cambia algo).
2. `POST /api/v1/leads` con `Idempotency-Key` (UUID): `leads-service` valida, verifica Turnstile y la promoción contra el catálogo, cifra los datos personales y guarda lead + consentimiento + atribución + evento de outbox en **una transacción**.
3. El usuario ve "Solicitud registrada" y el botón **Continuar por WhatsApp** (mensaje con promoción y código `SIS-XXXXX`). Nada depende del CRM.
4. El relay del outbox publica `lead.created.v1`; `crm-bridge-service` crea o actualiza el contacto en Chatwoot (bandeja por sede), etiqueta, envía el evento Lead a Meta si hay consentimiento de marketing y publica `crm.contact.synced.v1`; `leads-service` actualiza el estado.
5. Cuando el usuario escribe por WhatsApp, el webhook de Chatwoot vincula la conversación al lead por el código de referencia y aplica la regla de asignación.

Detalles: [docs/architecture/overview.md](docs/architecture/overview.md), [docs/architecture/v2-integration-spec.md](docs/architecture/v2-integration-spec.md), [docs/diagrams/c4.md](docs/diagrams/c4.md), [docs/api/README.md](docs/api/README.md), [docs/adr](docs/adr).

## Antes de producción

- Secretos en el gestor (docs/security/secrets.md) y variables de `infrastructure/docker/prod.env.example`; ningún valor `dev-*`.
- Verificar en Chatwoot el `account_id`, las bandejas por sede y el token; configurar el webhook con `?token=`, la allowlist de IP y la rotación (docs/security/chatwoot-webhooks.md).
- Confirmar que el WhatsApp comercial de la web (+51 987 867 402) es el de la bandeja de Chatwoot y completar el texto legal de la política de privacidad y del libro de reclamaciones.
- Claves de Turnstile, Sentry y (si aplica) Meta Conversions API y SMTP.
- Backups cifrados activos y primera prueba de restauración registrada (docs/operations/backups.md).
- Revisión ASVS L1 y ZAP baseline en staging sin hallazgos FAIL (docs/security/asvs-l1-checklist.md).
- Designar responsables del plan de incidentes y de las solicitudes ARCO (docs/security/incident-response.md, docs/security/data-retention-and-arco.md).
