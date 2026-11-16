# ADR 0008 · Caché del catálogo y revalidación por etiqueta

**Estado:** aceptada · 2026-11-13

## Contexto

La landing muestra promociones y especialidades que cambian pocas veces al día pero que, cuando cambian (desde admin-web), deben verse en minutos. Revalidar cada 60 s genera tráfico inútil y aun así deja ventanas con precios viejos. El catálogo además se consulta en cada carga, por lo que su latencia afecta al LCP.

## Decisión

Tres capas de caché con invalidación explícita:

1. **web-sis (Next):** `fetch(..., { next: { tags: ['catalog'], revalidate: 300 } })`. El catálogo se sirve desde la caché de datos de Next y se regenera como mucho cada 5 minutos aunque nadie lo invalide.
2. **Invalidación por etiqueta (B8):** tras cualquier alta, edición o baja en `/internal/admin/promotions|specialties`, promotions-service hace `POST {WEB_REVALIDATE_URL}` con `x-revalidate-secret` y `{"tags":["catalog"]}`. web-sis compara el secreto en tiempo constante y llama a `revalidateTag('catalog')`. Un fallo es un _warning_: nunca deshace la operación del panel (la caché caduca sola en ≤ 5 min).
3. **HTTP (B9):** `GET /api/v1/promotions|specialties` devuelve `ETag` (hash del cuerpo) y 304 ante `If-None-Match`; el gateway comprime con Brotli/gzip. Dentro de promotions-service, `CATALOG_CACHE_TTL_SECONDS` mantiene una caché corta en Redis.

`/api/revalidate` nunca se expone por el gateway (ADR 0007); solo es alcanzable por la red interna.

## Consecuencias

- Cambios del panel visibles en segundos; sin carga constante sobre promotions-service.
- Con varias réplicas de web-sis la caché de datos de Next es por réplica: la llamada de revalidación debe ir a cada réplica o usarse un manejador de caché compartido. Hoy hay una réplica; documentado como límite conocido.
- En contenedores `read_only`, la caché de Next vive en un `tmpfs` (`.next/cache`) y se pierde al reiniciar; el primer request reconstruye el catálogo.
- El secreto `REVALIDATE_SECRET`/`WEB_REVALIDATE_SECRET` entra en el inventario de secretos y su rotación (docs/security/secrets.md).
