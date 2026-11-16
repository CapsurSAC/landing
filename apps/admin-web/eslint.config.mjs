import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import base from '@capsur/eslint-config/next';

const config = [
  { ignores: ['.next/**', 'out/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**'] },
  ...nextVitals,
  ...nextTs,
  ...base,
  {
    // Scripts de línea de comandos y servidor simulado de e2e: la salida por consola es su interfaz.
    files: ['scripts/**/*.ts', 'e2e/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
