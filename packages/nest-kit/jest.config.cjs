/**
 * Jest con @swc/jest: compila TypeScript sin chequeo de tipos (el chequeo lo
 * hace `pnpm typecheck`). Los decoradores legacy y la emisión de metadatos son
 * imprescindibles para la inyección de dependencias de Nest.
 * @type {import('jest').Config}
 */
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '.*\\.spec\\.ts$',
  setupFiles: ['reflect-metadata', '<rootDir>/src/testing/jest.setup.ts'],
  transform: {
    '^.+\\.ts$': [
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
    ],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/testing/**', '!src/index.ts'],
  coverageDirectory: 'coverage',
};
