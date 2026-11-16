-- ---------------------------------------------------------------------------
-- Roles de PostgreSQL de PRODUCCIÓN con mínimo privilegio (C10, B11, C25).
--
-- Por servicio (promotions, leads, crm_bridge):
--   <svc>_migrator  dueño de la base y del esquema public. Lo usa SOLO el job
--                   de migraciones (`prisma migrate deploy`), con conexión
--                   directa a Postgres (no a través de PgBouncer).
--   <svc>_app       solo DML (SELECT/INSERT/UPDATE/DELETE) y uso de secuencias.
--                   Sin CREATEDB, sin CREATE en el esquema, sin TRUNCATE.
--                   Lo usa el servicio en ejecución, vía PgBouncer.
-- Transversales:
--   pgbouncer_auth  solo puede ejecutar pgbouncer.get_auth() (auth_query).
--   backup          lectura total (pg_read_all_data) para pg_dump.
--
-- Uso (lo ejecuta init-prod-roles.sh en el primer arranque, o a mano):
--   psql -v ON_ERROR_STOP=1 \
--     -v promotions_migrator_password=... -v promotions_app_password=... \
--     -v leads_migrator_password=...      -v leads_app_password=... \
--     -v crm_bridge_migrator_password=... -v crm_bridge_app_password=... \
--     -v pgbouncer_auth_password=...      -v backup_password=... \
--     -U postgres -d postgres -f prod-roles.sql
--
-- Es idempotente: crea lo que falta y vuelve a fijar contraseñas y permisos.
-- Requiere password_encryption = scram-sha-256 (por defecto en PG 14+).
-- ---------------------------------------------------------------------------
\set ON_ERROR_STOP on
SET password_encryption = 'scram-sha-256';

-- ------------------------------- roles ---------------------------------------
SELECT format('CREATE ROLE %I LOGIN', r) FROM unnest(ARRAY[
  'promotions_migrator', 'promotions_app',
  'leads_migrator', 'leads_app',
  'crm_bridge_migrator', 'crm_bridge_app',
  'pgbouncer_auth', 'backup'
]) AS r
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r)\gexec

ALTER ROLE promotions_migrator NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS LOGIN PASSWORD :'promotions_migrator_password';
ALTER ROLE promotions_app      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS LOGIN PASSWORD :'promotions_app_password';
ALTER ROLE leads_migrator      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS LOGIN PASSWORD :'leads_migrator_password';
ALTER ROLE leads_app           NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS LOGIN PASSWORD :'leads_app_password';
ALTER ROLE crm_bridge_migrator NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS LOGIN PASSWORD :'crm_bridge_migrator_password';
ALTER ROLE crm_bridge_app      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS LOGIN PASSWORD :'crm_bridge_app_password';
ALTER ROLE pgbouncer_auth      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS LOGIN PASSWORD :'pgbouncer_auth_password';
ALTER ROLE backup              NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS LOGIN PASSWORD :'backup_password';

-- Límites de conexión directos (PgBouncer agrupa las de la app).
ALTER ROLE promotions_app CONNECTION LIMIT 20;
ALTER ROLE leads_app CONNECTION LIMIT 30;
ALTER ROLE crm_bridge_app CONNECTION LIMIT 20;
ALTER ROLE promotions_migrator CONNECTION LIMIT 3;
ALTER ROLE leads_migrator CONNECTION LIMIT 3;
ALTER ROLE crm_bridge_migrator CONNECTION LIMIT 3;
ALTER ROLE backup CONNECTION LIMIT 3;
-- Evita consultas colgadas de la app.
ALTER ROLE promotions_app SET statement_timeout = '15s';
ALTER ROLE leads_app SET statement_timeout = '15s';
ALTER ROLE crm_bridge_app SET statement_timeout = '30s';
ALTER ROLE promotions_app SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE leads_app SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE crm_bridge_app SET idle_in_transaction_session_timeout = '30s';

GRANT pg_read_all_data TO backup;

-- ------------------------------ bases -----------------------------------------
SELECT format('CREATE DATABASE %I OWNER %I', d, d || '_migrator')
FROM unnest(ARRAY['promotions', 'leads', 'crm_bridge']) AS d
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = d)\gexec

REVOKE ALL ON DATABASE promotions FROM PUBLIC;
REVOKE ALL ON DATABASE leads FROM PUBLIC;
REVOKE ALL ON DATABASE crm_bridge FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE promotions TO promotions_migrator;
GRANT CONNECT ON DATABASE promotions TO promotions_app, pgbouncer_auth, backup;
GRANT CONNECT, TEMPORARY ON DATABASE leads TO leads_migrator;
GRANT CONNECT ON DATABASE leads TO leads_app, pgbouncer_auth, backup;
GRANT CONNECT, TEMPORARY ON DATABASE crm_bridge TO crm_bridge_migrator;
GRANT CONNECT ON DATABASE crm_bridge TO crm_bridge_app, pgbouncer_auth, backup;

-- ----------------- esquema y privilegios por defecto (por base) ---------------
-- Se repite el bloque en cada base. Las variables :svc se fijan antes de cada \connect.
\set svc promotions
\connect promotions
\ir prod-roles.per-db.sql

\set svc leads
\connect leads
\ir prod-roles.per-db.sql

\set svc crm_bridge
\connect crm_bridge
\ir prod-roles.per-db.sql
