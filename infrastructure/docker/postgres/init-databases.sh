#!/bin/bash
# ---------------------------------------------------------------------------
# Postgres LOCAL: crea una base de datos y un usuario por microservicio dentro
# de la misma instancia. Ningún servicio puede conectarse a la base de otro.
#
# Solo se ejecuta en la PRIMERA inicialización del volumen (docker-entrypoint-
# initdb.d). Los cambios de este archivo no afectan a volúmenes existentes;
# para aplicarlos en local: `pnpm infra:down -v && pnpm infra:up` (borra datos).
#
# Producción usa otro modelo (C10): roles <svc>_migrator / <svc>_app sin
# CREATEDB, TLS y SCRAM -> postgres/prod-roles.sql y pg_hba.prod.conf.
# El cifrado de datos personales se hace en la aplicación (AES-256-GCM,
# @capsur/nest-kit): NO se instala la extensión pgcrypto.
# ---------------------------------------------------------------------------
set -euo pipefail

create_db() {
  local db="$1" user="$2" pass="$3"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-SQL
    SET password_encryption = 'scram-sha-256';
    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${user}') THEN
        CREATE ROLE ${user} LOGIN PASSWORD '${pass}';
      END IF;
    END
    \$\$;
    SELECT 'CREATE DATABASE ${db} OWNER ${user}'
      WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${db}')\gexec
    REVOKE CONNECT ON DATABASE ${db} FROM PUBLIC;
    GRANT ALL PRIVILEGES ON DATABASE ${db} TO ${user};
    -- Solo para el stack local: Prisma Migrate (migrate dev) necesita crear la
    -- shadow database. En producción los roles NO tienen CREATEDB.
    ALTER ROLE ${user} CREATEDB;
    -- Evita transacciones abiertas olvidadas durante el desarrollo.
    ALTER ROLE ${user} SET idle_in_transaction_session_timeout = '60s';
SQL
  # Esquema public: solo el dueño de la base crea objetos.
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<-SQL
    REVOKE CREATE ON SCHEMA public FROM PUBLIC;
    ALTER SCHEMA public OWNER TO ${user};
SQL
}

create_db promotions promotions "${PROMOTIONS_DB_PASSWORD:-promotions}"
create_db leads leads "${LEADS_DB_PASSWORD:-leads}"
create_db crm_bridge crm_bridge "${CRM_BRIDGE_DB_PASSWORD:-crm_bridge}"
