# ---------------------------------------------------------------------------
# Servicio de copias de seguridad (C25). postgres:17-alpine (mismo pg_dump que
# el servidor) + age para cifrar con clave PÚBLICA: el servidor nunca tiene la
# clave privada, así que una intrusión no permite leer las copias.
#   docker build -t capsur/pg-backup infrastructure/docker/backup
# ---------------------------------------------------------------------------
FROM postgres:17-alpine
RUN apk add --no-cache age tini \
 && mkdir -p /backups /etc/crontabs
COPY backup.sh /usr/local/bin/backup.sh
COPY entrypoint.sh /usr/local/bin/backup-entrypoint.sh
RUN chmod 0755 /usr/local/bin/backup.sh /usr/local/bin/backup-entrypoint.sh
VOLUME ["/backups"]
HEALTHCHECK --interval=1h --timeout=10s --retries=1 \
  CMD find /backups -maxdepth 1 -name 'ok-*' -mmin -1560 | grep -q . || exit 1
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/backup-entrypoint.sh"]
