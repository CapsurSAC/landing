#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Prueba MENSUAL de restauración de backups (C25). Ver docs/operations/backups.md.
#
# Restaura una copia cifrada en un Postgres TEMPORAL y aislado (nunca toca
# producción), verifica integridad y contenido y mide el tiempo (evidencia de
# RTO). Se ejecuta en una máquina de operación con Docker y con acceso a la
# clave PRIVADA age (que no vive en el servidor de producción).
#
# Uso:
#   infrastructure/scripts/restore-test.sh <carpeta-backup> <identidad-age>
#   p. ej. restore-test.sh ./backups/20261201T081500Z ~/.secrets/capsur-backup.key
#
# Variables opcionales:
#   PG_IMAGE         imagen Postgres temporal (postgres:17-alpine)
#   TOOLS_IMAGE      imagen con age + pg_restore (se construye desde infrastructure/docker/backup)
#   MIN_TABLES       mínimo de tablas esperado por base (3)
#   KEEP=true        no borra el Postgres temporal al terminar (para inspección)
# Salida: resumen en Markdown para pegar en el registro de pruebas de restauración.
# ---------------------------------------------------------------------------
set -euo pipefail
# En Git Bash (Windows) evita que MSYS reescriba las rutas de los -v de Docker.
export MSYS_NO_PATHCONV=1
# Ruta del host tal como la entiende Docker (pwd -W en Git Bash; pwd en Linux/macOS).
hostpath() { (cd "$1" && { pwd -W 2>/dev/null || pwd; }); }

BACKUP_PATH="${1:-${BACKUP_PATH:-}}"
IDENTITY="${2:-${AGE_IDENTITY_FILE:-}}"
if [[ -z "$BACKUP_PATH" || -z "$IDENTITY" ]]; then
  echo "Uso: $0 <carpeta-backup> <archivo-identidad-age>" >&2
  exit 2
fi
[[ -d "$BACKUP_PATH" ]] || { echo "No existe la carpeta $BACKUP_PATH" >&2; exit 2; }
[[ -f "$IDENTITY" ]] || { echo "No existe la identidad $IDENTITY" >&2; exit 2; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PG_IMAGE="${PG_IMAGE:-postgres:17-alpine}"
TOOLS_IMAGE="${TOOLS_IMAGE:-capsur/pg-backup:restore-test}"
MIN_TABLES="${MIN_TABLES:-3}"
RUN_ID="capsur-restore-$(date +%s)"
NET="$RUN_ID-net"
PGPASS="$(LC_ALL=C tr -dc 'a-zA-Z0-9' </dev/urandom | head -c 32 || true)"
BACKUP_ABS="$(hostpath "$BACKUP_PATH")"
IDENTITY_ABS="$(hostpath "$(dirname "$IDENTITY")")/$(basename "$IDENTITY")"

cleanup() {
  if [[ "${KEEP:-false}" != "true" ]]; then
    docker rm -f "$RUN_ID-pg" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
  else
    echo "KEEP=true: Postgres temporal '$RUN_ID-pg' en la red '$NET' (contraseña en la salida anterior)."
  fi
}
trap cleanup EXIT

START=$(date +%s)
echo "## Prueba de restauración $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo
echo "- Copia: \`$(basename "$BACKUP_ABS")\`"

if ! docker image inspect "$TOOLS_IMAGE" >/dev/null 2>&1; then
  docker build -q -t "$TOOLS_IMAGE" "$(hostpath "$SCRIPT_DIR/../docker/backup")" >/dev/null
fi

docker network create "$NET" >/dev/null
docker run -d --name "$RUN_ID-pg" --network "$NET" --network-alias pg \
  --tmpfs /var/lib/postgresql/data:size=4g \
  -e POSTGRES_PASSWORD="$PGPASS" "$PG_IMAGE" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$RUN_ID-pg" pg_isready -U postgres -q 2>/dev/null; then break; fi
  sleep 1
done
docker exec "$RUN_ID-pg" pg_isready -U postgres -q

# Todo el descifrado ocurre dentro del contenedor de herramientas: el texto
# plano nunca se escribe en el disco del host.
docker run --rm --network "$NET" \
  -v "$BACKUP_ABS:/backup:ro" -v "$IDENTITY_ABS:/key/identity:ro" \
  -e PGHOST=pg -e PGUSER=postgres -e PGPASSWORD="$PGPASS" -e MIN_TABLES="$MIN_TABLES" \
  --entrypoint /bin/sh "$TOOLS_IMAGE" -c '
set -eu
set -o pipefail
cd /backup
echo "- Integridad (SHA-256): $(sha256sum -c SHA256SUMS >/dev/null 2>&1 && echo correcta || { echo FALLO; exit 1; })"
echo
echo "| Base | Tablas | Filas (aprox.) | Última migración | Segundos |"
echo "| --- | --- | --- | --- | --- |"
for f in *.dump.age; do
  db="${f%.dump.age}"
  t0=$(date +%s)
  createdb "$db"
  age --decrypt --identity /key/identity "$f" | pg_restore --no-owner --no-privileges --exit-on-error -d "$db"
  tables=$(psql -d "$db" -Atc "select count(*) from information_schema.tables where table_schema = '"'"'public'"'"' and table_type = '"'"'BASE TABLE'"'"'")
  psql -d "$db" -qc "analyze" >/dev/null
  rows=$(psql -d "$db" -Atc "select coalesce(sum(n_live_tup),0) from pg_stat_user_tables")
  last=$(psql -d "$db" -Atc "select migration_name from _prisma_migrations where finished_at is not null order by finished_at desc limit 1" 2>/dev/null || echo "-")
  t1=$(date +%s)
  echo "| $db | $tables | $rows | ${last:--} | $((t1 - t0)) |"
  if [ "$tables" -lt "$MIN_TABLES" ]; then echo "La base $db tiene $tables tablas (< $MIN_TABLES)" >&2; exit 1; fi
done
if [ -f globals.sql.age ]; then
  echo
  echo "- Roles en globals.sql: $(age --decrypt --identity /key/identity globals.sql.age | grep -c "^CREATE ROLE" || true)"
fi
'
END=$(date +%s)
echo
echo "- Resultado: **correcta**"
echo "- Tiempo total de restauración (RTO medido): $((END - START)) s"
