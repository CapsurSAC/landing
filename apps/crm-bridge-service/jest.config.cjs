/**
 * Pruebas unitarias con @swc/jest (B15): compilan TypeScript sin chequeo de tipos (lo hace
 * `pnpm typecheck`). Decoradores legacy y metadatos para la inyección de Nest.
 * Las de integración (Testcontainers) están en jest.int.config.cjs.
 * @type {import('jest').Config}
 */
const swcTransform = [
  '@swc/jest',
  {
    swcrc: false,
    sourceMaps: 'inline',
    jsc: {
      target: 'es2022',
      parser: { syntax: 'typescript', decorators: true },
      transform: { legacyDecorator: true, decoratorMetadata: true },
      keepClassNames: true,
    },
    module: { type: 'commonjs' },
  },
];

module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/test/int/'],
  setupFiles: ['reflect-metadata'],
  transform: { '^.+\\.ts$': swcTransform },
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/instrument.ts', '!src/cli/**', '!src/**/*.module.ts'],
  coverageDirectory: 'coverage',
};
