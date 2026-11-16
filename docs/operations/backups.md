# Copias de seguridad y restauración (C25)

## Objetivos

| Objetivo                                | Valor                                                                                     | Justificación                                                                                                                                                           |
| --------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RPO** (pérdida máxima de datos)       | **24 h** con copia diaria; **≤ 15 min** si el proveedor ofrece snapshots/PITR del volumen | Los leads también existen en Chatwoot (contacto) y en los eventos; perder un día es recuperable comercialmente                                                          |
| **RTO** (tiempo máximo de recuperación) | **4 h**                                                                                   | Restaurar 3 bases pequeñas (< 1 GB) tarda minutos; el resto es provisionar y verificar                                                                                  |
| Retención                               | 14 días en el servidor; 90 días en almacenamiento externo (mensual)                       | Equilibrio entre recuperación y minimización de datos (los leads se anonimizan a los 730 días; una copia no debe resucitar datos anonimizados más allá de su retención) |

Las cifras se validan en cada prueba mensual (el script mide el tiempo real de restauración).

## Cómo se hace

Servicio `backup` de `infrastructure/docker/docker-compose.prod.yml` (imagen `infrastructure/docker/backup`):

- `postgres:17-alpine` (mismo `pg_dump` que el servidor) + `age` + cron de busybox.
- Cada día a las 03:15 (America/Lima): `pg_dump -Fc` de `promotions`, `leads` y `crm_bridge`, y `pg_dumpall --globals-only --no-role-passwords`.
- **Cifrado en streaming** con la clave **pública** `BACKUP_AGE_RECIPIENT`: el texto plano nunca toca el disco y el servidor no puede descifrar sus propias copias.
- Rol `backup` de solo lectura (`pg_read_all_data`), conexión con TLS.
- `SHA256SUMS` y `manifest.json` por copia; marca `ok-<fecha>` que usa el healthcheck (falla si no hay copia en 26 h).
- Retención: borra carpetas con más de `BACKUP_RETENTION_DAYS` (14).
- Además, los datos personales ya están cifrados en las tablas (ADR 0009): doble barrera.

### Claves

```bash
age-keygen -o capsur-backup.key      # genera par de claves
grep 'public key' capsur-backup.key   # -> BACKUP_AGE_RECIPIENT=age1...
```

La clave **privada** se guarda en la bóveda del gestor de secretos y en copia offline; **nunca** en el servidor. Al rotarla, conservar las privadas antiguas mientras existan copias cifradas con ellas (≤ 90 días).

### Copia externa (fuera del servidor)

Sincronizar el volumen `backups` con almacenamiento de objetos con versionado y bloqueo de objetos (p. ej. Backblaze B2, Cloudflare R2, S3), con credenciales de **solo escritura** desde el servidor:

```bash
# cron del host o tarea de EasyPanel, 04:00
rclone sync /var/lib/docker/volumes/capsur-lead-platform-prod_backups/_data remote:capsur-backups/daily --max-age 48h
```

Una vez al mes, copiar la última copia a `monthly/` (retención 90 días por regla de ciclo de vida).

### EasyPanel

Si se usa el Postgres gestionado de EasyPanel: activar sus backups programados **y** mantener este servicio (cifrado con clave pública y prueba de restauración propia). Configurar el servicio `backup` como app con la imagen de `infrastructure/docker/backup`, las variables `PG*`/`BACKUP_*` y un volumen persistente.

## TLS de Postgres (referencia)

El compose de producción exige TLS en las conexiones TCP (`pg_hba.prod.conf`). Certificado de servidor autofirmado o de una CA interna en `POSTGRES_TLS_DIR`:

```bash
mkdir -p /srv/capsur/postgres-tls && cd /srv/capsur/postgres-tls
openssl req -x509 -newkey rsa:3072 -nodes -days 825 -subj "/CN=postgres" \
  -keyout server.key -out server.crt
chown 70:70 server.key server.crt && chmod 600 server.key   # uid 70 = postgres en alpine
```

Los clientes usan `sslmode=require` (cifrado). Para `verify-full`, emitir el certificado con una CA interna, montar la CA en los clientes y usar `sslrootcert`.

## Prueba mensual de restauración

Primer lunes de cada mes, en una máquina de operación con Docker (nunca en producción):

```bash
# 1. Descargar la última copia desde el almacenamiento externo
rclone copy remote:capsur-backups/daily/20261201T081500Z ./restore/20261201T081500Z
# 2. Restaurar en un Postgres temporal, verificar y medir
infrastructure/scripts/restore-test.sh ./restore/20261201T081500Z ~/.secrets/capsur-backup.key
```

El script:

1. Verifica `SHA256SUMS`.
2. Levanta un `postgres:17-alpine` temporal con datos en `tmpfs` en una red aislada.
3. Descifra cada base **dentro** del contenedor de herramientas y la restaura con `pg_restore --no-owner --no-privileges`.
4. Comprueba número de tablas (≥ `MIN_TABLES`), filas aproximadas y última migración de Prisma.
5. Imprime un resumen en Markdown con el tiempo total (RTO medido) y destruye todo (salvo `KEEP=true`).

Pegar el resumen en el registro siguiente. Si falla: abrir incidente de severidad media y corregir antes de 7 días.

### Registro de pruebas

| Fecha | Copia | Resultado | RTO medido | Responsable | Observaciones |
| ----- | ----- | --------- | ---------- | ----------- | ------------- |
|       |       |           |            |             |               |

## Restauración real (desastre)

1. Declarar incidente (docs/security/incident-response.md) y congelar escrituras: escalar servicios a 0.
2. Provisionar Postgres nuevo con `prod-roles.sql` (roles y bases vacías).
3. Para cada base: `age -d -i clave.key <db>.dump.age | pg_restore --no-owner --role=<svc>_migrator -d <db>`; después re-ejecutar `prod-roles.sql` para reaplicar privilegios por defecto y `GRANT` sobre las tablas restauradas.
4. Ejecutar los jobs `*-migrate` (no deberían aplicar nada si la copia es de la misma versión).
5. Levantar servicios; verificar `/internal/health`, outbox y colas; reprocesar DLQ si procede.
6. Recuperar desde Chatwoot/eventos los leads del intervalo perdido (RPO) si es posible.
