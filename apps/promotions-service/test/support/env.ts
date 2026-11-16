/**
 * Entorno de las pruebas e2e. Debe importarse ANTES que cualquier módulo de
 * la aplicación: `ConfigModule.forRoot` valida las variables al cargarse.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.LOG_LEVEL = 'silent';
process.env.CATALOG_CACHE_TTL_SECONDS = '60';
delete process.env.REDIS_URL;
process.env.INTERNAL_API_TOKENS = JSON.stringify({
  'admin-web': 'test-admin-token-123456',
  'leads-service': 'test-leads-token-123456',
});
delete process.env.WEB_REVALIDATE_URL;
