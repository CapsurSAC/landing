/**
 * Pruebas de integración (B17): PostgreSQL 17 y RabbitMQ 4 en contenedores
 * propios con Testcontainers; se aplican las migraciones reales de Prisma.
 * Necesita Docker. Se ejecutan en serie (comparten contenedores por archivo).
 * @type {import('jest').Config}
 */
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/test/integration'],
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '.*\\.int-spec\\.ts$',
  transform: { '^.+\\.ts$': require('./jest.swc.cjs') },
  setupFiles: ['reflect-metadata', '<rootDir>/test/support/env.ts'],
  testTimeout: 180_000,
  maxWorkers: 1,
};
