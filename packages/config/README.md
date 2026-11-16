# @capsur/config

Esquemas Zod reutilizables para las variables de entorno de los servicios, carga validada con mensajes legibles y generación de `.env.example` (B25).

```bash
pnpm --filter @capsur/config build   # dist/ (incluye el binario capsur-env-example)
pnpm --filter @capsur/config test    # node:test + tsx
```

## Fragmentos

Todos reciben texto (como `process.env`) y devuelven el tipo útil. Los mensajes de error nunca incluyen el valor recibido.

| Fragmento | Entrada → salida |
| --- | --- |
| `portSchema` | `"3002"` → `3002` (1–65535). Uso: `portSchema.default(3002)` |
| `nodeEnvSchema` | `development` \| `test` \| `production` (defecto `development`) |
| `logLevelSchema` | niveles de pino (defecto `info`) |
| `databaseUrlSchema` | URL `postgresql://` o `postgres://` |
| `redisUrlSchema` | URL `redis(s)://`, opcional (vacía = `undefined`) |
| `rabbitUrlSchema` | URL `amqp(s)://` |
| `sentryDsnSchema` | URL opcional (vacía = Sentry desactivado) |
| `internalTokensSchema` | JSON `{"<llamador>":"<token>"}` → `Record<string,string>`; en producción cada token ≥ 16 caracteres |
| `corsOriginsSchema` | CSV de orígenes → `string[]` (vacío = `[]`) |
| `base64Key32Schema` | base64 que decodifica a exactamente 32 bytes (`PII_ENCRYPTION_KEY`) |
| `base64KeyMin32Schema` | base64 de al menos 32 bytes (`PII_HASH_KEY`) |
| `booleanFlagSchema` | `true`/`false`/`1`/`0` (vacío = `false`) → `boolean` |
| `jsonSchema(inner)` | texto JSON validado con `inner` |
| `csvSchema` / `csvOf(item)` | CSV → `string[]` (con validación por elemento) |
| `emptyAsUndefined(schema)`, `optionalStringSchema` | trata `VAR=` como no definida |

La regla «producción» de `internalTokensSchema` mira el `NODE_ENV` del entorno que se valida (no `process.env`) cuando se usa a través de `defineEnv`/`loadEnv`.

## Definir y cargar el entorno de un servicio

```ts
// apps/leads-service/src/config/env.definition.ts (sin efectos al importar: lo lee el CLI)
import { z } from 'zod';
import {
  base64Key32Schema, base64KeyMin32Schema, booleanFlagSchema, corsOriginsSchema, databaseUrlSchema,
  defineEnv, internalTokensSchema, logLevelSchema, nodeEnvSchema, portSchema,
  rabbitUrlSchema, redisUrlSchema, sentryDsnSchema, type EnvOf,
} from '@capsur/config';

export const envDefinition = defineEnv(
  {
    NODE_ENV: nodeEnvSchema,
    PORT: portSchema.default(3002),
    LOG_LEVEL: logLevelSchema,
    DATABASE_URL: databaseUrlSchema,
    REDIS_URL: redisUrlSchema,
    RABBITMQ_URL: rabbitUrlSchema,
    INTERNAL_API_TOKENS: internalTokensSchema,
    SWAGGER_ENABLED: booleanFlagSchema.default(false),
    SENTRY_DSN: sentryDsnSchema,
    CORS_ORIGINS: corsOriginsSchema,
    PII_ENCRYPTION_KEY: base64Key32Schema.describe('Clave AES-256-GCM (32 bytes en base64)'),
    PII_HASH_KEY: base64KeyMin32Schema,
    LEAD_RETENTION_DAYS: z.coerce.number().int().positive().default(730),
  },
  {
    title: 'leads-service: variables de entorno (desarrollo)',
    examples: {
      NODE_ENV: 'development',
      PORT: '3002',
      LOG_LEVEL: 'info',
      DATABASE_URL: 'postgresql://leads:leads@localhost:5432/leads',
      REDIS_URL: 'redis://localhost:6379',
      RABBITMQ_URL: 'amqp://leads_svc:leads_svc_local@localhost:5672',
      INTERNAL_API_TOKENS: '{"admin-web":"dev-admin-to-leads"}',
      SWAGGER_ENABLED: 'false',
      SENTRY_DSN: '',
      CORS_ORIGINS: 'http://localhost:3000',
      PII_ENCRYPTION_KEY: 'ZGV2LW9ubHktcGlpLWtleS0zMi1ieXRlcy1sb25nISE=',
      PII_HASH_KEY: 'ZGV2LW9ubHktaGFzaC1rZXktMzItYnl0ZXMtbG9uZyEhIQ==',
      LEAD_RETENTION_DAYS: '730',
    },
    describe: {
      INTERNAL_API_TOKENS: 'Llamadores internos: JSON {"<llamador>":"<token>"}',
      PII_HASH_KEY: 'Clave HMAC para phone_hash/email_hash (≥ 32 bytes en base64)',
    },
  },
);

export type Env = EnvOf<typeof envDefinition>;

// apps/leads-service/src/config/env.ts
export const env: Env = loadEnv(envDefinition); // lanza EnvValidationError
```

Si algo falla, `EnvValidationError` lista cada variable sin mostrar valores:

```
Configuración inválida: 2 variable(s) de entorno con problemas:
  - DATABASE_URL: no está definida
  - INTERNAL_API_TOKENS: En producción el token de "admin-web" debe tener al menos 16 caracteres
```

Los comentarios del `.env.example` salen de `describe` o, si no, de `.describe()` en el esquema.

## Generar `.env.example`

```bash
# tras compilar el servicio
pnpm exec capsur-env-example dist/config/env.definition.js envDefinition   # escribe ./.env.example
pnpm exec capsur-env-example dist/config/env.definition.js envDefinition --stdout  # imprime
pnpm exec capsur-env-example dist/config/env.definition.js envDefinition --out .env.example
```

Sugerencia de script en el servicio: `"env:example": "capsur-env-example dist/config/env.definition.js envDefinition"`. El módulo no debe ejecutar `loadEnv` al importarse (o el CLI fallará si faltan variables): exporta la definición en un archivo y carga el entorno en otro.

API programática: `renderEnvExample(definition, source?)` devuelve el texto.
