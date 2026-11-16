-- ---------------------------------------------------------------------------
-- Bloque por base de datos incluido por prod-roles.sql (\ir). Requiere la
-- variable psql :svc (promotions | leads | crm_bridge) y estar conectado a
-- esa base. No ejecutar de forma aislada.
-- ---------------------------------------------------------------------------
-- \set concatena sus argumentos: promotions + _migrator = promotions_migrator
\set migrator :svc _migrator
\set app :svc _app

-- El esquema public pertenece al migrador; nadie más puede crear objetos.
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO :"migrator";
GRANT USAGE ON SCHEMA public TO :"app", backup;

-- Objetos existentes (si la base ya tenía tablas).
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"app";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO :"app";
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO :"app";

-- Objetos futuros creados por el migrador (prisma migrate deploy).
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"app";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator" IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"app";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator" IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO :"app";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migrator" REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- auth_query de PgBouncer: devuelve el verificador SCRAM del usuario que se
-- conecta. SECURITY DEFINER (dueño postgres) y solo ejecutable por pgbouncer_auth.
-- Nunca devuelve superusuarios.
CREATE SCHEMA IF NOT EXISTS pgbouncer AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA pgbouncer FROM PUBLIC;
GRANT USAGE ON SCHEMA pgbouncer TO pgbouncer_auth;
CREATE OR REPLACE FUNCTION pgbouncer.get_auth(p_usename text)
RETURNS TABLE (usename name, passwd text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT s.usename, s.passwd
  FROM pg_catalog.pg_shadow s
  WHERE s.usename = p_usename
    AND NOT s.usesuper
    AND s.usename NOT IN ('pgbouncer_auth', 'backup');
$$;
REVOKE ALL ON FUNCTION pgbouncer.get_auth(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pgbouncer.get_auth(text) TO pgbouncer_auth;
