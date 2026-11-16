import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import base from '@capsur/eslint-config/next';

/*
 * eslint-config-next y @capsur/eslint-config traen cada uno su copia de
 * typescript-eslint; ESLint 9 no permite registrar dos objetos distintos con
 * el mismo nombre de plugin. Se reutiliza el de eslint-config-next en las
 * reglas compartidas (mismas reglas, una sola instancia del plugin).
 */
const tsPlugin = nextTs.find((c) => c.plugins?.['@typescript-eslint'])?.plugins['@typescript-eslint'];
const sharedRules = base.map((c) =>
  tsPlugin && c.plugins?.['@typescript-eslint'] ? { ...c, plugins: { ...c.plugins, '@typescript-eslint': tsPlugin } } : c,
);

const config = [
  {
    ignores: [
      '.next/**',
      'out/**',
      'next-env.d.ts',
      'playwright-report/**',
      'test-results/**',
      'e2e/__screenshots__/**',
      'coverage/**',
    ],
  },
  ...nextVitals,
  ...nextTs,
  ...sharedRules,
  {
    // Scripts de mantenimiento (Node): pueden escribir en consola.
    files: ['scripts/**/*.mjs'],
    rules: { 'no-console': 'off' },
  },
];

export default config;
