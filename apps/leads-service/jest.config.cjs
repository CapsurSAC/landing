/**
 * Pruebas unitarias y HTTP (fakes en memoria, sin base de datos ni broker).
 * Las de integración con Testcontainers están en jest.int.config.cjs.
 * @type {import('jest').Config}
 */
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/test/integration/'],
  transform: { '^.+\\.ts$': require('./jest.swc.cjs') },
  setupFiles: ['reflect-metadata', '<rootDir>/test/support/env.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/instrument.ts', '!src/**/*.module.ts', '!src/openapi/**'],
  coverageDirectory: 'coverage',
};
