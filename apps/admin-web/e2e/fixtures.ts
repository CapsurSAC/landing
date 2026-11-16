import { expect, type Page } from '@playwright/test';

/** Usuarios y tokens SOLO para e2e (nunca se usan fuera de las pruebas). */
export const E2E_USERS = {
  admin: { email: 'admin@e2e.local', name: 'Admin E2E', password: 'clave-admin-e2e-123' },
  asesor: { email: 'asesor@e2e.local', name: 'Asesora E2E', password: 'clave-asesor-e2e-123' },
} as const;

export const E2E_TOKENS = {
  promotions: 'e2e-admin-to-promotions',
  leads: 'e2e-admin-to-leads',
  crm: 'e2e-admin-to-crm',
} as const;

export async function login(page: Page, who: keyof typeof E2E_USERS, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
  await page.getByLabel('Correo').fill(E2E_USERS[who].email);
  await page.getByLabel('Contraseña').fill(E2E_USERS[who].password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Recoge violaciones de CSP y errores de consola para verificarlos al final. */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}
