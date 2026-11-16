import { expect, test } from '@playwright/test';
import { mockApi, pinSession } from './support';

test.beforeEach(async ({ page }) => {
  await pinSession(page, 'a');
});

test.describe('Libro de Reclamaciones (A5)', () => {
  test('valida, envía el cuerpo del contrato y muestra código y fecha límite', async ({ page }) => {
    await mockApi(page);
    await page.goto('/libro-de-reclamaciones');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Libro de Reclamaciones');

    await page.getByTestId('submit-complaint').click();
    await expect(page.getByLabel(/Nombres y apellidos/)).toBeFocused();
    await expect(page.getByText('Escribe tu nombre completo.')).toBeVisible();

    await page.getByLabel(/Nombres y apellidos/).fill('Ana Pérez Quispe');
    await page.getByLabel(/Número de documento/).fill('12345678');
    await page.getByLabel(/Domicilio/).fill('Av. Bolognesi 123, Tacna');
    await page.getByLabel(/^Teléfono/).fill('987654321');
    await page.getByLabel(/Correo electrónico/).fill('ana@example.com');
    await page.getByLabel(/Soy menor de edad/).check();
    await page.getByLabel(/Nombre del padre, madre o apoderado/).fill('Rosa Quispe');
    await page.getByLabel(/^Descripción/).fill('Especialidad Desarrollo Web con IA');
    await page.getByLabel(/Monto reclamado/).fill('249.00');
    await page.getByText('Queja', { exact: true }).click();
    await page.getByLabel(/^Detalle/).fill('No me respondieron por WhatsApp en tres días.');
    await page.getByLabel(/^Pedido/).fill('Que me contacten.');
    await page.getByLabel(/Declaro que los datos consignados son verdaderos/).check();

    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().endsWith('/api/v1/complaints') && req.method() === 'POST'),
      page.getByTestId('submit-complaint').click(),
    ]);
    expect(request.postDataJSON()).toMatchObject({
      brand: 'sis',
      kind: 'queja',
      consumer: { documentType: 'DNI', documentNumber: '12345678', isMinor: true, guardianName: 'Rosa Quispe', email: 'ana@example.com' },
      item: { type: 'servicio', amount: 24900 },
      website: '',
    });
    await expect(page.getByTestId('filed-code')).toHaveText('SIS-LR-2026-000123');
    await expect(page.getByTestId('filed-due')).toHaveText('4 de diciembre de 2026');
  });
});

test.describe('Derechos ARCO (C9)', () => {
  test('envía la solicitud y muestra el código', async ({ page }) => {
    await mockApi(page);
    await page.goto('/derechos-arco');
    await page.getByText('Rectificación', { exact: true }).click();
    await page.getByLabel(/Nombres y apellidos/).fill('Ana Pérez');
    await page.getByLabel(/Correo electrónico/).fill('ana@example.com');
    await page.getByLabel(/Código de solicitud/).fill('sis-7k3m2');
    await page.getByTestId('submit-privacy').click();
    await expect(page.getByText('Indica qué dato quieres rectificar')).toBeVisible();
    await page.getByLabel(/^Detalle/).fill('Mi correo correcto es ana.perez@example.com');
    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().endsWith('/api/v1/privacy/requests')),
      page.getByTestId('submit-privacy').click(),
    ]);
    expect(request.postDataJSON()).toMatchObject({ brand: 'sis', type: 'rectification', reference: 'SIS-7K3M2' });
    await expect(page.getByTestId('filed-code')).toHaveText('SIS-ARCO-2026-000045');
  });
});

test.describe('Especialidades (A10)', () => {
  test('página con presentación, público, temario, CTA y JSON-LD Course', async ({ page }) => {
    const api = await mockApi(page);
    await page.goto('/especialidades/desarrollo-web-con-ia');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Desarrollo Web con Inteligencia Artificial');
    await expect(page.getByRole('heading', { name: 'Presentación' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Dirigido a' })).toBeVisible();
    await expect(page.getByText('Implementación de IA en Desarrollo Web')).toBeVisible();
    await expect(page.getByRole('link', { name: /Solicitar catálogo/ }).first()).toHaveAttribute('href', '/promociones/con-ia#catalogo');
    await expect(page).toHaveTitle(/Desarrollo Web con IA/);

    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    const course = ld.map((t) => JSON.parse(t) as Record<string, unknown>).find((d) => d['@type'] === 'Course');
    expect(course).toMatchObject({ name: 'Desarrollo Web con Inteligencia Artificial', hasCourseInstance: { courseMode: 'online', courseWorkload: 'PT250H' } });
    await expect.poll(() => api.trackingEvents.some((e) => e.event === 'specialty_viewed' && e.specialtyId === 'desarrollo-web-con-ia')).toBe(true);
  });

  test('especialidad sin brochure: solo datos del catálogo y derivación al asesor', async ({ page }) => {
    await mockApi(page);
    await page.goto('/especialidades/gestion-integral-bd-con-ia');
    await expect(page.getByRole('heading', { name: 'Temario y duración' })).toBeVisible();
    await expect(page.getByText('te los confirma un asesor por WhatsApp')).toBeVisible();
  });

  test('slug inexistente responde 404', async ({ page }) => {
    const res = await page.goto('/especialidades/no-existe');
    expect(res?.status()).toBe(404);
  });
});
