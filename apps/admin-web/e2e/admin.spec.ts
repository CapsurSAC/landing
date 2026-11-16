import { expect, test } from '@playwright/test';
import { collectConsoleErrors, E2E_USERS, login } from './fixtures';

test.describe('autenticación', () => {
  test('sin sesión redirige a /login conservando el destino', async ({ page }) => {
    await page.goto('/leads?status=crm_failed');
    await expect(page).toHaveURL(/\/login\?next=%2Fleads%3Fstatus%3Dcrm_failed$/);
    await expect(page.getByRole('heading', { name: 'Panel interno' })).toBeVisible();
  });

  test('login fallido muestra un error genérico y el correcto entra al resumen', async ({ page, context }) => {
    await page.goto('/login');
    await page.getByLabel('Correo').fill(E2E_USERS.admin.email);
    await page.getByLabel('Contraseña').fill('clave-equivocada');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'Correo o contraseña incorrectos' })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    // Se conserva el correo (no la contraseña) tras el fallo.
    await expect(page.getByLabel('Correo')).toHaveValue(E2E_USERS.admin.email);

    await page.getByLabel('Contraseña').fill(E2E_USERS.admin.password);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { name: 'Resumen', level: 1 })).toBeVisible();

    const cookie = (await context.cookies()).find((c) => c.name.includes('capsur_admin'));
    expect(cookie).toBeDefined();
    expect(cookie!.name).toBe('__Host-capsur_admin');
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe('Strict');
    expect(cookie!.secure).toBe(true);

    // Cierre de sesión
    await page.getByRole('button', { name: 'Salir' }).first().click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/estado');
    await expect(page).toHaveURL(/\/login\?next=%2Festado/);
  });

  test('cabeceras de seguridad y CSP con nonce', async ({ page }) => {
    const response = await page.goto('/login');
    const headers = response!.headers();
    expect(headers['content-security-policy']).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-robots-tag']).toContain('noindex');
    expect(headers['referrer-policy']).toBe('no-referrer');
    expect(headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(headers['cross-origin-resource-policy']).toBe('same-origin');
    expect(headers['x-powered-by']).toBeUndefined();
  });
});

test.describe('administración', () => {
  test('resumen con embudo, tarjetas de hoy y experimentos', async ({ page }) => {
    const errors = collectConsoleErrors(page);
    await login(page, 'admin');
    await expect(page.getByTestId('daily-cards')).toContainText('Leads de hoy');
    await expect(page.getByTestId('funnel')).toContainText('Visitas a la landing');
    await expect(page.getByTestId('funnel')).toContainText('% del paso anterior');
    await expect(page.getByTestId('experiments')).toContainText('beneficio');
    await page.getByRole('link', { name: '7 días' }).click();
    await expect(page).toHaveURL(/range=7/);
    await expect(page.getByRole('link', { name: '7 días' })).toHaveAttribute('aria-current', 'page');
    expect(errors.filter((e) => /Content Security Policy|Refused/.test(e))).toEqual([]);
  });

  test('lista de leads filtrada por estado y exportación CSV', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/leads');
    const table = page.getByTestId('leads-table');
    await expect(table.locator('tbody tr')).toHaveCount(25);

    await page.getByLabel('Estado CRM').selectOption('crm_failed');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await expect(page).toHaveURL(/status=crm_failed/);
    const rows = table.locator('tbody tr');
    await expect(rows).toHaveCount(7);
    for (const chip of await rows.locator('td:last-child').allTextContents()) expect(chip).toContain('Fallo CRM');
    await expect(rows.first().getByRole('link', { name: /^\+51/ })).toHaveAttribute('href', /^https:\/\/wa\.me\/51\d+$/);

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-csv').click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^leads-sis-\d{8}\.csv$/);

    // Detalle del lead
    await rows.first().getByRole('link', { name: /^SIS-/ }).click();
    await expect(page.getByRole('heading', { name: 'Atribución' })).toBeVisible();
    await expect(page.getByTestId('anonymize-open')).toBeVisible();
  });

  test('crear una promoción con vista previa', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/promociones/nueva');
    const id = `e2e-${Date.now().toString(36)}`;
    await page.getByLabel('Identificador (slug)').fill(id);
    await page.getByLabel('Nombre comercial').fill('E2E PROMO');
    await page.getByLabel('Titular de la tarjeta').fill('S/159');
    await expect(page.getByTestId('promotion-preview')).toContainText('E2E PROMO');
    await expect(page.getByTestId('promotion-preview')).toContainText('S/159');

    // Validación en español sin perder lo escrito
    await page.getByLabel('Precio (S/)').fill('159,999');
    await page.getByRole('button', { name: 'Crear promoción' }).click();
    await expect(page.getByText('Monto en soles con hasta 2 decimales')).toBeVisible();
    await expect(page.getByLabel('Nombre comercial')).toHaveValue('E2E PROMO');

    await page.getByLabel('Precio (S/)').fill('159.90');
    await expect(page.getByText('Se guarda como 15990 céntimos.')).toBeVisible();
    await page.getByRole('button', { name: 'Crear promoción' }).click();
    await expect(page).toHaveURL(/\/promociones\?ok=creada/);
    await expect(page.getByRole('status').filter({ hasText: 'Promoción creada' })).toBeVisible();
    const row = page.getByTestId('promotions-table').getByRole('row').filter({ hasText: id });
    await expect(row).toContainText('E2E PROMO');
    await expect(row).toContainText('159.90');
  });

  test('estado: salud, colas, auditoría y reproceso', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/estado');
    await expect(page.getByTestId('health')).toContainText('promotions-service');
    await expect(page.getByTestId('health')).toContainText('Degradado');
    await expect(page.getByTestId('queues')).toContainText('crm-bridge.lead-created.dlq');
    await expect(page.getByTestId('audit')).toContainText('integrations.retry');
    await page.getByRole('button', { name: 'Reprocesar fallidos' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Reprocesados 4' })).toBeVisible();
  });
});

test.describe('rol asesor', () => {
  test('solo ve leads, sin exportar ni anonimizar', async ({ page }) => {
    await login(page, 'asesor');
    await expect(page).toHaveURL(/\/leads$/);
    await expect(page.getByTestId('user-role').first()).toHaveText('Asesor');
    await expect(page.getByTestId('leads-table')).toBeVisible();
    await expect(page.getByTestId('export-csv')).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: 'Secciones del panel' }).first();
    await expect(nav.getByRole('link')).toHaveCount(1);

    await page.getByTestId('leads-table').getByRole('link', { name: /^SIS-/ }).first().click();
    await expect(page.getByRole('heading', { name: 'Contacto' })).toBeVisible();
    await expect(page.getByTestId('anonymize-open')).toHaveCount(0);

    // El servidor también lo impide aunque se escriba la URL a mano.
    await page.goto('/promociones');
    await expect(page).toHaveURL(/\/sin-permiso$/);
    const csv = await page.request.get('/leads/export');
    expect(csv.status()).toBe(403);
  });
});
