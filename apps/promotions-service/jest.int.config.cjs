/**
 * Pruebas de integración (B17): PostgreSQL real en un contenedor efímero de
 * Testcontainers, con las migraciones del servicio aplicadas. Requiere Docker.
 */
const base = require('./jest.config.cjs');

/** @type {import('jest').Config} */
module.exports = {
  ...base,
  roots: ['<rootDir>/test'],
  testRegex: '.*\\.int-spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/'],
  testTimeout: 120_000,
  maxWorkers: 1,
};
