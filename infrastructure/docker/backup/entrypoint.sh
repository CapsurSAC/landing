#!/bin/sh
# Programa backup.sh con el cron de busybox. BACKUP_SCHEDULE en formato cron
# (por defecto 03:15 hora del contenedor; TZ=America/Lima en el compose).
set -eu
: "${BACKUP_AGE_RECIPIENT:?Falta BACKUP_AGE_RECIPIENT (clave pública age1...)}"
: "${PGPASSWORD:?Falta PGPASSWORD del rol backup}"

SCHEDULE="${BACKUP_SCHEDULE:-15 3 * * *}"
# Las variables se pasan al job escribiéndolas en un archivo de entorno de solo
# lectura para root (el cron de busybox no hereda el entorno).
export -p | grep -E "^export (PG|BACKUP_|TZ=)" > /run/backup.env
chmod 600 /run/backup.env
echo "$SCHEDULE . /run/backup.env && /usr/local/bin/backup.sh >> /proc/1/fd/1 2>&1" > /etc/crontabs/root

if [ "${BACKUP_RUN_ON_START:-false}" = "true" ]; then
  /usr/local/bin/backup.sh
fi
echo "Backups programados: '$SCHEDULE' (retención ${BACKUP_RETENTION_DAYS:-14} días)"
exec crond -f -l 6 -c /etc/crontabs
