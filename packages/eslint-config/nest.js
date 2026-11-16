import base from './base.js';

/** Identificadores que nunca deben interpolarse en un mensaje de log (C26). */
const PII_IDENTIFIER = '/^(phone|email|fullName|documentNumber)$/';

/** Llamadas `logger.x(...)` y `this.logger.x(...)`. */
const LOGGER_CALLS = [
  "CallExpression[callee.type='MemberExpression'][callee.object.type='Identifier'][callee.object.name='logger']",
  "CallExpression[callee.type='MemberExpression'][callee.object.type='MemberExpression'][callee.object.property.name='logger']",
];

const PII_MESSAGE =
  'No interpoles ni concatenes datos personales (phone, email, fullName, documentNumber) en mensajes de log: ' +
  'pásalos como campos del objeto de contexto para que la redacción de pino los oculte, o no los registres.';

/**
 * Prohíbe `logger.info(`... ${phone}`)` y `logger.warn('…' + lead.email)`.
 * Limitación conocida: solo detecta los nombres literales anteriores (como
 * variable o propiedad) dentro de plantillas y concatenaciones en la llamada;
 * no sigue alias (`const p = lead.phone`) ni otros nombres de logger.
 */
const piiInLoggerRules = LOGGER_CALLS.flatMap((call) => [
  { selector: `${call} TemplateLiteral Identifier[name=${PII_IDENTIFIER}]`, message: PII_MESSAGE },
  { selector: `${call} BinaryExpression[operator='+'] Identifier[name=${PII_IDENTIFIER}]`, message: PII_MESSAGE },
]);

/** Servicios NestJS: los decoradores y la inyección hacen ruido con algunas reglas. */
export default [
  ...base,
  {
    // Nest resuelve la inyección con metadatos de decoradores: el parser debe
    // saberlo para que consistent-type-imports no convierta en `import type`
    // las clases inyectadas por constructor (romperían design:paramtypes).
    languageOptions: {
      parserOptions: { emitDecoratorMetadata: true, experimentalDecorators: true },
    },
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports', disallowTypeAnnotations: false },
      ],
      // Los servicios registran todo con el logger (pino con redacción), nunca con console (C26).
      // Con opciones explícitas ({}) para no heredar el `allow: [warn, error]` de base.js.
      'no-console': ['error', {}],
      'no-restricted-syntax': ['error', ...piiInLoggerRules],
    },
  },
  {
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts', '**/test/**'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
];
