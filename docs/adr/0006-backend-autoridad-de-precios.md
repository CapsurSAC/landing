# ADR 0006 · El backend es la autoridad sobre precios y vigencias

**Estado:** aceptada · 2026-11-13

## Contexto

Es tentador que la landing envíe el precio mostrado al registrar la solicitud. Cualquier usuario puede manipular el navegador, y una promoción puede vencer entre la carga de la página y el envío.

## Decisión

El navegador envía únicamente el identificador de la promoción. `leads-service` lo valida contra `promotions-service` (`/internal/promotions/:id/validate`) y guarda nombre, precio de referencia y campaña vigentes en ese momento. Si el catálogo no responde y no hay validación reciente en caché, la API responde 503 con `Retry-After` en lugar de aceptar datos sin verificar.

## Consecuencias

- Las promociones se gestionan en un solo lugar (en la v2, desde `admin-web`).
- La landing puede mostrar un catálogo de respaldo si el servicio cae, pero no puede registrar promociones inexistentes.
- Dependencia síncrona entre leads y promociones, mitigada con caché corta y tiempos de espera estrictos.
