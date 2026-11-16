import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;

/**
 * - chromium / mobile: pruebas funcionales y de accesibilidad (axe).
 * - visual: regresión visual (B28) en 375, 1024 y 1366 px. Snapshots en
 *   e2e/__screenshots__ (versionados). Actualizar con `pnpm test:visual:update`.
 *
 * La API siempre se intercepta con page.route; los servicios apuntan a un
 * puerto cerrado para que el catálogo use el respaldo local (determinista).
 * Requiere un build previo (`pnpm --filter @capsur/web-sis build`).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Renderizado dinámico (CSP con nonce): la primera petición en frío puede tardar.
  timeout: 60_000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{projectName}-{platform}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    locale: 'es-PE',
    timezoneId: 'America/Lima',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: /visual\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: /visual\.spec\.ts/ },
    { name: 'visual', use: { ...devices['Desktop Chrome'] }, testMatch: /visual\.spec\.ts/ },
  ],
  webServer: {
    command: `pnpm exec next start --port ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // En e2e la API se intercepta con page.route; estas URLs no deben responder.
      PROMOTIONS_SERVICE_URL: 'http://127.0.0.1:9',
      LEADS_SERVICE_URL: 'http://127.0.0.1:9',
      REVALIDATE_SECRET: 'e2e-revalidate-secret',
    },
  },
});
