# Diagramas

Los diagramas se mantienen como Mermaid dentro de los documentos para que evolucionen con el texto:

- **C4 nivel 1 (contexto) y nivel 2 (contenedores)**, con admin-web, colas nuevas, Meta CAPI, SMTP, Turnstile y Sentry: [`c4.md`](c4.md)
- Componentes y dependencias: [`../architecture/overview.md`](../architecture/overview.md)
- Secuencia del formulario, outbox, Chatwoot y webhook: [`../architecture/lead-flow.md`](../architecture/lead-flow.md)
- Topología de mensajería (exchanges, colas de reintento y DLQ): diagrama en [`c4.md`](c4.md#topología-de-mensajería-detalle-del-nivel-2); definición en [`../../infrastructure/rabbitmq/definitions.json`](../../infrastructure/rabbitmq/definitions.json)

Para exportar a PNG/SVG: `npx -y @mermaid-js/mermaid-cli -i <archivo>.md -o <salida>.svg`.
