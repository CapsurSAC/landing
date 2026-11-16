import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * Pruebas unitarias y de componentes (B27): Vitest + jsdom + Testing Library.
 * Sin plugin de React: basta con el JSX automático del transformador.
 */
export default defineConfig({
  // tsconfig usa "jsx": "preserve" (lo exige Next); en pruebas se compila con el runtime automático.
  // Vitest 5 usa Vite 8, que transforma con oxc (equivalente a esbuild.jsx = 'automatic', opción que Vite 8 ignora).
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@capsur/api-contracts': fileURLToPath(new URL('./src/contracts/index.ts', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    css: false,
  },
});
