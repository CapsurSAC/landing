# ADR 0003 · Transactional Outbox para publicar eventos

**Estado:** aceptada · 2026-11-13

## Contexto

Si leads-service guarda el lead y luego publica en RabbitMQ, una caída entre ambos pasos pierde el evento (lead sin CRM) o publica sin lead (CRM sin solicitud). Un "two-phase commit" entre PostgreSQL y RabbitMQ no existe en la práctica.

## Decisión

El evento `lead.created.v1` se inserta en `outbox_events` **dentro de la misma transacción** que el lead. Un relay periódico reclama eventos pendientes (`FOR UPDATE SKIP LOCKED`), los publica con confirmaciones del broker y los marca como publicados; ante fallo aplica backoff exponencial y tras 10 intentos los marca como fallidos para revisión.

## Consecuencias

- Entrega "al menos una vez": los consumidores deben ser idempotentes (`processed_events`).
- Latencia de segundos entre registro y sincronización, aceptable porque el usuario no espera al CRM.
- Métricas de outbox (`pending`, `failed`) expuestas en el health del servicio.
