# Changesets

Versionado de los servicios y paquetes del monorepo. Todos los paquetes son **privados**: no se publica nada en npm; la versión y las etiquetas git (`@capsur/leads-service@1.4.0`) sirven para trazar qué se desplegó (imagen, Sentry `release`, changelog).

```bash
pnpm changeset            # describe el cambio y elige el tipo (patch/minor/major) por paquete
pnpm changeset:status     # qué paquetes cambiarán de versión
pnpm changeset:version    # aplica las versiones y genera CHANGELOG.md por paquete
pnpm changeset:tag        # crea las etiquetas git de los paquetes versionados (sin publicar)
```

Reglas:

- Un PR que cambia el comportamiento de un servicio incluye su changeset.
- `major` = cambio incompatible de contrato HTTP o de evento (también lo detecta el job de contratos con `oasdiff`).
- Los cambios solo de documentación, CI o pruebas no necesitan changeset.
