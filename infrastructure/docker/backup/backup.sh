#!/bin/sh
# ---------------------------------------------------------------------------
# Copia lógica cifrada de las tres bases (C25).
#   - pg_dump en formato custom (-Fc, comprimido) por base + roles globales
#     sin contraseñas.
#   - Cifrado en streaming con age y la clave PÚBLICA BACKUP_AGE_RECIPIENT
#     (nada en claro toca el disco).
#   - Suma SHA-256 de cada archivo cifrado y marca ok-<fecha> al terminar.
#   - Retención: borra carpetas con más de BACKUP_RETENTION_DAYS días (14).
# Variables: PGHOST, PGPORT, PGUSER (rol backup), PGPASSWORD, PGSSLMODE,
#   BACKUP_DATABASES ("promotions leads crm_bridge"), BACKUP_AGE_RECIPIENT,
#   BACKUP_RETENTION_DAYS, BACKUP_DIR (/backups).
# Copia externa: sincronizar BACKUP_DIR con almacenamiento de objetos (ver
# docs/operations/backups.md); los archivos ya van cifrados.
# ---------------------------------------------------------------------------
set -eu
set -o pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DATABASES="${BACKUP_DATABASES:-promotions leads crm_bridge}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
: "${BACKUP_AGE_RECIPIENT:?}"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TARGET="$BACKUP_DIR/$STAMP"
mkdir -p "$TARGET"
umask 077
START=$(date +%s)
echo "[backup] inicio $STAMP -> $TARGET"

for db in $DATABASES; do
  echo "[backup] pg_dump $db"
  pg_dump --format=custom --compress=6 --no-password --dbname="$db" \
    | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$TARGET/$db.dump.age"
done

echo "[backup] roles globales (sin contraseñas)"
pg_dumpall --globals-only --no-role-passwords --no-password \
  | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" --output "$TARGET/globals.sql.age"

(cd "$TARGET" && sha256sum ./*.age > SHA256SUMS)
END=$(date +%s)
printf '{"stamp":"%s","databases":"%s","seconds":%s}\n' "$STAMP" "$DATABASES" "$((END - START))" > "$TARGET/manifest.json"

# Marca de éxito para el healthcheck y limpieza de marcas antiguas.
rm -f "$BACKUP_DIR"/ok-*
touch "$BACKUP_DIR/ok-$STAMP"

echo "[backup] retención: borrando copias con más de $RETENTION_DAYS días"
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime "+$RETENTION_DAYS" -exec rm -rf {} +

echo "[backup] fin $STAMP en $((END - START)) s; tamaño $(du -sh "$TARGET" | cut -f1)"
