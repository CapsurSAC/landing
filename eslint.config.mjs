import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  {
    ignores: ['.next/**', 'out/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**', 'e2e/__screenshots__/**', 'coverage/**'],
  },
  ...nextVitals,
  ...nextTs,
  {
    files: ['scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
