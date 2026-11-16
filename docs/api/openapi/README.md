# Contratos OpenAPI versionados (B14)

Cada servicio exporta aquí su especificación con `pnpm --filter @capsur/<servicio> openapi:export` (o `pnpm openapi:export` para todos):

| Archivo                   | Servicio           |
| ------------------------- | ------------------ |
| `promotions-service.json` | promotions-service |
| `leads-service.json`      | leads-service      |
| `crm-bridge-service.json` | crm-bridge-service |

Requisitos del script `openapi:export` (equipos de servicio):

- Genera el documento a partir de los esquemas Zod de `@capsur/api-contracts` **sin** conectarse a Postgres, Redis ni RabbitMQ (CI lo ejecuta sin infraestructura).
- Salida determinista (claves ordenadas, sin fechas ni versiones de build) para que el diff sea estable.

En CI (`.github/workflows/ci.yml`, job _Contrato OpenAPI_):

1. Se exporta el contrato del servicio afectado y se exige que coincida con el archivo versionado (si cambia, hay que confirmarlo en el PR).
2. En PRs se compara con la versión de la rama base usando `oasdiff breaking` (imagen `tufin/oasdiff`); cualquier cambio incompatible (`ERR`) hace fallar el job. Un cambio incompatible intencionado se publica como ruta/versión nueva (`/api/v2/...`) manteniendo la anterior, y se registra con un changeset `major`.
