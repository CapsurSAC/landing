/**
 * Pruebas de integración (B17): Testcontainers con PostgreSQL 17 y RabbitMQ 4 propios
 * (topología de infrastructure/rabbitmq/definitions.json importada). Necesitan Docker.
 * `pnpm test:int` (en serie: cada suite arranca sus contenedores).
 * @type {import('jest').Config}
 */
module.exports = {
  rootDir: '.',
  roots: ['<rootDir>/test/int'],
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testRegex: '.*\\.int-spec\\.ts$',
  setupFiles: ['reflect-metadata'],
  testTimeout: 240_000,
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
};
