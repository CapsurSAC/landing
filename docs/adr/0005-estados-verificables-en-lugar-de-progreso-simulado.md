# ADR 0005 · Estados verificables en lugar de una barra de progreso simulada

**Estado:** aceptada · 2026-11-13

## Contexto

El diseño móvil original mostraba «Conectando con un asesor — 75 %» con una barra de progreso. Ese porcentaje no corresponde a ningún hecho del sistema: registrar un formulario no abre una conversación de WhatsApp ni garantiza que un asesor la tenga.

## Decisión

Tras el registro, la interfaz muestra solo hechos comprobables:

1. **Solicitud registrada** (respuesta del backend, con código de referencia).
2. **Continuar por WhatsApp** (acción del usuario; enlace con mensaje prellenado y código).
3. Estado de sincronización con el CRM, leído de `GET /api/v1/leads/:id/status`, que cambia únicamente por eventos reales (`crm.contact.synced.v1`). Si no llega confirmación en un minuto, se informa que la solicitud está guardada y que se contactará igualmente.

## Consecuencias

- Menos promesas falsas y menos tickets de "la página se quedó cargando".
- Requiere el endpoint de estado y el consumo de eventos CRM en leads-service.
- El sondeo del estado es breve y se detiene solo; no mantiene conexiones abiertas.
