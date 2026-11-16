/**
 * Transformador común de Jest: @swc/jest (B15) compila TypeScript sin chequeo
 * de tipos (lo hace `pnpm typecheck`). Decoradores legacy y emisión de
 * metadatos son imprescindibles para la inyección de dependencias de Nest.
 */
module.exports = [
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
