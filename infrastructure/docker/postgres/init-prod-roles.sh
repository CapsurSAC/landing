#!/bin/sh
# ---------------------------------------------------------------------------
# Primer arranque de Postgres en PRODUCCIÓN (docker-entrypoint-initdb.d).
# Aplica prod-roles.sql con las contraseñas tomadas de variables de entorno.
# Para re-aplicar (rotación de contraseñas, base existente) ejecutar a mano:
#   docker compose -f docker-compose.prod.yml exec postgres sh /prod/init-prod-roles.sh
# ---------------------------------------------------------------------------
set -eu

: "${PROMOTIONS_MIGRATOR_DB_PASSWORD:?}" "${PROMOTIONS_APP_DB_PASSWORD:?}"
: "${LEADS_MIGRATOR_DB_PASSWORD:?}" "${LEADS_APP_DB_PASSWORD:?}"
: "${CRM_BRIDGE_MIGRATOR_DB_PASSWORD:?}" "${CRM_BRIDGE_APP_DB_PASSWORD:?}"
: "${PGBOUNCER_AUTH_PASSWORD:?}" "${BACKUP_DB_PASSWORD:?}"

psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" --dbname postgres \
  -v promotions_migrator_password="$PROMOTIONS_MIGRATOR_DB_PASSWORD" \
  -v promotions_app_password="$PROMOTIONS_APP_DB_PASSWORD" \
  -v leads_migrator_password="$LEADS_MIGRATOR_DB_PASSWORD" \
  -v leads_app_password="$LEADS_APP_DB_PASSWORD" \
  -v crm_bridge_migrator_password="$CRM_BRIDGE_MIGRATOR_DB_PASSWORD" \
  -v crm_bridge_app_password="$CRM_BRIDGE_APP_DB_PASSWORD" \
  -v pgbouncer_auth_password="$PGBOUNCER_AUTH_PASSWORD" \
  -v backup_password="$BACKUP_DB_PASSWORD" \
  -f /prod/prod-roles.sql
