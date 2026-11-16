# Convenciones de los microservicios NestJS

Aplican a `promotions-service`, `leads-service` y `crm-bridge-service`. Un servicio nuevo copia estas reglas; no las reinterpreta.

## Versiones fijadas

| Paquete | Versión |
| --- | --- |
| Node.js | 24 (mínimo 22) |
| NestJS (`@nestjs/common`, `core`, `platform-express`, `testing`) | 11.2.10 |
| `@nestjs/config` | 4.0.4 |
| `@nestjs/swagger` | 11.4.8 |
| `@nestjs/throttler` | 6.7.1 |
| Prisma (`prisma`, `@prisma/client`) | 6.19.3 |
| `nestjs-pino` / `pino` / `pino-http` | 5.3.1 / 10.4.0 / 11.0.0 |
| `zod` | 4.6.7 |
| TypeScript | 5.9.3 |
| Jest / ts-jest | 30.5.2 / 29.4.15 |

Las dependencias se declaran en el `package.json` del servicio y se instalan desde la raíz con `pnpm install`. No se instalan paquetes globales.

## Estructura interna (Clean Architecture)

```
apps/<servicio>/
├── prisma/
│   ├── schema.prisma          # generator output = "./generated/client" (ignorado por git)
│   ├── migrations/
│   └── seed.ts                # solo si el servicio tiene datos semilla
├── src/
│   ├── main.ts                # bootstrap: pino, helmet, CORS, prefijo, swagger, shutdown hooks
│   ├── app.module.ts
│   ├── config/                # esquema Zod de variables de entorno + ConfigModule
│   ├── domain/                # entidades, value objects, errores de dominio, eventos. SIN dependencias de Nest/Prisma
│   ├── application/           # casos de uso, puertos (interfaces), DTO internos
│   │   ├── ports/
│   │   └── use-cases/
│   ├── infrastructure/        # adaptadores: Prisma, RabbitMQ, HTTP a otros servicios, Redis, Chatwoot
│   └── presentation/          # controladores HTTP, webhooks, consumidores, pipes/filters
│       ├── http/
│       └── consumers/
└── test/                      # e2e con supertest (opcional en v1)
```

Reglas de dependencia: `presentation` → `application` → `domain`. `infrastructure` implementa los puertos de `application` y se enlaza en los módulos de Nest con tokens (`Symbol` o `string`). `domain` y `application` no importan nada de `@nestjs/*` salvo `Injectable` cuando sea imprescindible para la inyección; preferir clases planas registradas con `useFactory`.

## Contratos y validación

- El contrato público vive en `@capsur/api-contracts` (Zod). Los controladores validan la entrada con un `ZodValidationPipe` propio y responden con los tipos del contrato.
- Errores HTTP en formato problem-details: `{ type, title, status, detail?, code?, errors?[], traceId? }` mediante un `AllExceptionsFilter` global. Las validaciones devuelven 400 con `errors: [{ path, message }]`.
- Nunca se confía en precios, vigencias ni identificadores enviados por el navegador.

## Observabilidad y operación

- Logs JSON estructurados con `nestjs-pino`; `pino-pretty` solo en desarrollo. Redactar `req.headers.authorization`, `phone`, `email`, `fullName`.
- `GET /internal/health` responde `{ status, service, version, checks, timestamp }` y comprueba las dependencias reales (base de datos, broker, Redis).
- Cabecera `x-request-id` aceptada y propagada; si no llega, se genera.
- `app.enableShutdownHooks()` y cierre ordenado de Prisma y conexiones AMQP.

## Base de datos

- Una base de datos y un usuario por servicio. Prisma con `DATABASE_URL`.
- `prisma generate` escribe en `prisma/generated/client` para que dos servicios no compartan el mismo cliente generado en el store de pnpm.
- Migraciones versionadas en `prisma/migrations`. En contenedor se ejecuta `prisma migrate deploy` antes de arrancar.

## Mensajería (RabbitMQ)

- Exchange `capsur.events` (topic). Routing key = nombre del evento (`lead.created.v1`).
- Sobre del mensaje: `EventEnvelope` del paquete de contratos. `id` es un UUID y los consumidores lo guardan en `processed_events` para ser idempotentes.
- Publicación con confirmaciones (`ConfirmChannel`), mensajes persistentes, `contentType: application/json`.
- Los consumidores hacen `ack` solo tras persistir; ante error recuperable hacen `nack(requeue=false)` para que el mensaje caiga en la cola de reintento con TTL; tras `MAX_ATTEMPTS` (cabecera `x-attempts`) se publica en `capsur.events.dlx`.

## Scripts de `package.json`

```
build, dev, start, lint, typecheck, test, test:cov, db:generate, db:migrate, db:migrate:dev, db:seed (si aplica)
```

## Pruebas

- Unitarias con Jest sobre casos de uso y servicios de dominio usando fakes en memoria de los puertos. Sin base de datos.
- Cobertura mínima de casos: camino feliz, validación, idempotencia, fallo de dependencia externa.

## Docker

Imagen multi-stage basada en `node:24-alpine` con `pnpm deploy --filter <servicio> --prod` para copiar solo las dependencias del servicio. Contenedor no root, `HEALTHCHECK` sobre `/internal/health`, arranque con `node dist/main.js`.
