# ADR 0002 · Clean Architecture dentro de cada microservicio

**Estado:** aceptada · 2026-11-13

## Contexto

NestJS invita a poner lógica en controladores y servicios acoplados a Prisma. Eso dificulta probar reglas de negocio sin base de datos y cambiar de proveedor (por ejemplo, otro CRM).

## Decisión

Cuatro capas por servicio: `presentation` (HTTP, webhooks, consumidores), `application` (casos de uso, puertos, DTO), `domain` (entidades, reglas, eventos de dominio) e `infrastructure` (Prisma, RabbitMQ, Chatwoot, Redis). Las dependencias apuntan hacia el dominio; la infraestructura implementa los puertos.

Ejemplo: `CreateLeadUseCase` no conoce Prisma ni Chatwoot; recibe `LeadRepository`, `PromotionCatalog`, `EventPublisher` y `Clock`.

## Consecuencias

- Casos de uso probados con fakes en memoria, sin contenedores.
- Algo más de código (puertos y adaptadores) a cambio de independencia tecnológica.
- Las convenciones concretas están en `docs/architecture/service-conventions.md`.
