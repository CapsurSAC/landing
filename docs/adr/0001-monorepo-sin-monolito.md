# ADR 0001 · Monorepositorio con servicios independientes

**Estado:** aceptada · 2026-11-13

## Contexto

La plataforma empieza con una landing (SIS) pero debe incorporar otras marcas de CAPSUR. Un único proyecto que mezcle interfaz, formularios, base de datos, WhatsApp y CRM se vuelve imposible de desplegar y escalar por partes. Repositorios separados, en cambio, encarecen compartir contratos y herramientas en un equipo pequeño.

## Decisión

Un monorepositorio (pnpm Workspaces + Turborepo) que organiza el código, pero **no** un monolito de ejecución:

- `apps/*` son procesos, contenedores, bases de datos y despliegues independientes.
- `packages/api-contracts` comparte solo contratos públicos y tipos; nunca modelos ORM, repositorios ni lógica de negocio.
- Cada servicio versiona y despliega por separado (imagen Docker propia).

## Consecuencias

- Un cambio de contrato se ve en todos los consumidores en el mismo cambio (typecheck de todo el workspace).
- Hay que vigilar que nadie importe código interno de otra app (lint y revisión).
- Los pipelines filtran por paquete afectado (`turbo run --filter`).
