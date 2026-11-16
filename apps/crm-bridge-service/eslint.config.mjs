import nest from '@capsur/eslint-config/nest';

export default [
  ...nest,
  {
    // Nest inyecta por constructor usando `design:paramtypes`: las clases inyectadas deben
    // importarse como valor. Con estas opciones, `consistent-type-imports` no las marca
    // en archivos que usan decoradores (ver tsconfig: experimentalDecorators + emitDecoratorMetadata).
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true },
    },
  },
];
