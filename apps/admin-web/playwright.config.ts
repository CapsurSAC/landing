import { defineConfig, devices } from '@playwright/test';
import bcrypt from 'bcryptjs';
import { E2E_TOKENS as TOKENS, E2E_USERS } from './e2e/fixtures';

/**
 * E2E contra `next start` (requiere `pnpm --filter @capsur/admin-web build`)
 * y un servidor simulado de los tres servicios (e2e/mock-services.ts).
 */
const PORT = 3104;

// Coste bajo para no ralentizar el arranque; en producción se usa 12.
const users = JSON.stringify([
  { email: E2E_USERS.admin.email, name: E2E_USERS.admin.name, role: 'admin', passwordHash: bcrypt.hashSync(E2E_USERS.admin.password, 6) },
  { email: E2E_USERS.asesor.email, name: E2E_USERS.asesor.name, role: 'asesor', passwordHash: bcrypt.hashSync(E2E_USERS.asesor.password, 6) },
]);

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    locale: 'es-PE',
    timezoneId: 'America/Lima',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm exec tsx e2e/mock-services.ts',
      url: 'http://127.0.0.1:4101/internal/health',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        MOCK_PROMOTIONS_TOKEN: TOKENS.promotions,
        MOCK_LEADS_TOKEN: TOKENS.leads,
        MOCK_CRM_TOKEN: TOKENS.crm,
      },
    },
    {
      command: `pnpm exec next start --port ${PORT}`,
      url: `http://localhost:${PORT}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        // Ignora el .env local: el entorno de e2e es solo el de aquí. Además evita que
        // Next expanda los "$" de los hash bcrypt cuando la clave también está en .env.
        __NEXT_PROCESSED_ENV: 'true',
        NODE_ENV: 'production',
        ADMIN_SESSION_SECRET: 'e2e-only-session-secret-0123456789abcdef',
        ADMIN_USERS_JSON: users,
        PROMOTIONS_SERVICE_URL: 'http://127.0.0.1:4101',
        LEADS_SERVICE_URL: 'http://127.0.0.1:4102',
        CRM_BRIDGE_SERVICE_URL: 'http://127.0.0.1:4103',
        PROMOTIONS_SERVICE_TOKEN: TOKENS.promotions,
        LEADS_SERVICE_TOKEN: TOKENS.leads,
        CRM_BRIDGE_SERVICE_TOKEN: TOKENS.crm,
        SENTRY_DSN: '',
      },
    },
  ],
});
