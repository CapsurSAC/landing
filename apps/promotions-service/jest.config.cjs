/**
 * Pruebas unitarias y e2e (sin infraestructura). Transformación con SWC
 * (B15): mucho más rápida que ts-jest y con soporte de decoradores y metadata
 * que necesita la inyección de Nest. Las pruebas de integración con
 * Testcontainers usan jest.int.config.cjs.
 */
/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testEnvironment: 'node',
  moduleFileExtensions: ['js', 'json', 'ts'],
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '\\.int-spec\\.ts$'],
  transform: {
    '^.+\\.ts$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2022',
        },
        module: { type: 'commonjs' },
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/instrument.ts', '!src/**/*.module.ts'],
  coverageDirectory: 'coverage',
};
