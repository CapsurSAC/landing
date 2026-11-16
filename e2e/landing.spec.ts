import { expect, test, type Page } from '@playwright/test';
import { leadResponse, mockApi, pinSession, STATUS_TOKEN } from './support';

async function fillForm(page: Page) {
  await page.getByLabel('Nombre y apellidos').fill('Ana Pérez');
  await page.getByLabel('Número de WhatsApp').fill('987 654 321');
  await page.getByLabel('Correo electrónico').fill('ana@example.com');
}

test.describe('Landing SIS', () => {
  test.beforeEach(async ({ page }) => {
    await pinSession(page, 'a');
  });

  test('muestra el hero, las promociones y preselecciona la destacada', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Tu experiencia');
    const group = page.getByRole('radiogroup', { name: 'Promoción' });
    await expect(group.getByRole('radio')).toHaveCount(3);
    await expect(page.getByTestId('promo-con-ia')).toHaveAttribute('aria-checked', 'true');
  });

  test('valida el formulario antes de enviar y enfoca el primer error', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await page.getByTestId('submit-lead').click();
    await expect(page.getByText('Escribe tu nombre y apellidos.')).toBeVisible();
    await expect(page.getByLabel('Nombre y apellidos')).toBeFocused();
    await page.getByLabel('Nombre y apellidos').fill('Ana Pérez');
    await page.getByLabel('Número de WhatsApp').fill('12345');
    await page.getByLabel('Número de WhatsApp').blur();
    await expect(page.locator('p.error-msg', { hasText: '9 dígitos y empieza con 9' })).toBeVisible();
  });

  test('registra la solicitud con especialidades, sede y experimento; muestra estados verificables', async ({ page }) => {
    const api = await mockApi(page);
    await page.goto('/');
    await page.getByTestId('promo-dos-por-uno').click();
    await expect(page.getByTestId('promo-dos-por-uno')).toHaveAttribute('aria-checked', 'true');

    const picker = page.getByTestId('specialty-picker');
    await picker.getByText('Desarrollo Web con IA', { exact: true }).click();
    await picker.getByText('Computación e Informática', { exact: true }).click();
    await expect(picker.getByRole('checkbox', { name: 'Ciberseguridad 4.0' })).toBeDisabled();

    await fillForm(page);
    await page.getByTestId('campus-picker').getByText('Arequipa').click();

    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().endsWith('/api/v1/leads') && req.method() === 'POST'),
      page.getByTestId('submit-lead').click(),
    ]);
    const body = request.postDataJSON() as Record<string, unknown>;
    expect(body.promotionId).toBe('dos-por-uno');
    expect(body.specialtyIds).toEqual(['desarrollo-web-con-ia', 'computacion-e-informatica']);
    expect(body.campus).toBe('arequipa');
    expect(body.phone).toBe('987654321');
    expect(body.phoneCountry).toBe('PE');
    expect(body.experiment).toEqual({ id: 'hero-copy', variant: 'a' });
    expect(request.headers()['idempotency-key']).toMatch(/[0-9a-f-]{36}/);

    const confirmation = page.getByTestId('lead-confirmation');
    await expect(confirmation).toBeVisible();
    await expect(confirmation.getByRole('heading', { level: 2 })).toHaveText('Solicitud registrada');
    await expect(confirmation.getByText('SIS-7K3M2')).toBeVisible();
    await expect(page.getByTestId('whatsapp-cta')).toHaveAttribute('href', /wa\.me\/51987654321/);
    await expect(confirmation.getByText('Un asesor ya tiene tu solicitud.')).toBeVisible({ timeout: 10_000 });
    expect(api.statusRequests[0]?.headers()['x-lead-token']).toBe(STATUS_TOKEN);
    await expect(page.getByTestId('promo-con-ia')).toBeDisabled();

    // A21: encuesta opcional con el token firmado.
    const survey = page.getByTestId('feedback-survey');
    await survey.getByText('Instagram', { exact: true }).click();
    await survey.getByRole('button', { name: 'Enviar' }).click();
    await expect(page.getByTestId('feedback-thanks')).toBeVisible();
    expect(api.feedbackRequests[0]?.headers()['x-lead-token']).toBe(STATUS_TOKEN);
    expect(api.feedbackRequests[0]?.postDataJSON()).toEqual({ source: 'instagram' });

    // A15: al recargar en la misma sesión se restaura la confirmación.
    await page.reload();
    await expect(page.getByTestId('lead-confirmation')).toBeVisible();
    await expect(page.getByTestId('feedback-survey')).toHaveCount(0);
  });

  test('guarda el borrador en la sesión y lo restaura al recargar (A15)', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    await page.getByLabel('Nombre y apellidos').fill('Ana Pérez');
    await page.getByLabel('Correo electrónico').fill('ana@example.com');
    await page.getByTestId('promo-pack-ia-pro').click();
    await page.reload();
    await expect(page.getByLabel('Nombre y apellidos')).toHaveValue('Ana Pérez');
    await expect(page.getByLabel('Correo electrónico')).toHaveValue('ana@example.com');
    await expect(page.getByTestId('promo-pack-ia-pro')).toHaveAttribute('aria-checked', 'true');
  });

  test('explica cuando la promoción ya no está disponible', async ({ page }) => {
    await mockApi(page);
    await page.route('**/api/v1/leads', (route) =>
      route.fulfill({
        status: 422,
        json: { title: 'Promoción no disponible', status: 422, code: 'PROMOTION_NOT_AVAILABLE' },
      }),
    );
    await page.goto('/');
    await page.getByLabel('Nombre y apellidos').fill('Ana Pérez');
    await page.getByLabel('Número de WhatsApp').fill('987654321');
    await page.getByLabel('Correo electrónico').fill('ana@example.com');
    await page.getByTestId('submit-lead').click();
    await expect(page.getByTestId('lead-form').getByRole('alert')).toContainText('ya no está disponible');
  });

  test('muestra el error de especialidades que devuelve el backend', async ({ page }) => {
    await mockApi(page);
    await page.route('**/api/v1/leads', (route) =>
      route.fulfill({
        status: 400,
        json: { title: 'Datos inválidos', status: 400, errors: [{ path: 'specialtyIds', message: 'Esta promoción incluye 1 especialidad' }] },
      }),
    );
    await page.goto('/');
    await fillForm(page);
    await page.getByTestId('submit-lead').click();
    await expect(page.getByTestId('specialty-picker')).toContainText('Esta promoción incluye 1 especialidad');
  });

  test('?promo= preselecciona la promoción de la campaña (A30)', async ({ page }) => {
    await mockApi(page);
    await page.goto('/?promo=pack-ia-pro');
    await expect(page.getByTestId('promo-pack-ia-pro')).toHaveAttribute('aria-checked', 'true');
  });

  test('/promociones/[id] reutiliza la landing con metadatos propios (A24, A30)', async ({ page, request }) => {
    await mockApi(page);
    await page.goto('/promociones/dos-por-uno');
    await expect(page.getByTestId('promo-dos-por-uno')).toHaveAttribute('aria-checked', 'true');
    await expect(page).toHaveTitle(/Promoción 2×1 · S\/350/);
    const ogImage = await page.locator('meta[property="og:image"]').first().getAttribute('content');
    expect(ogImage).toContain('/promociones/dos-por-uno/opengraph-image');
    const image = await request.get(new URL(ogImage!).pathname);
    expect(image.status()).toBe(200);
    expect(image.headers()['content-type']).toBe('image/png');
    expect((await page.request.get('/promociones/no-existe')).status()).toBe(404);
  });

  test('variante b del experimento: otro texto en el hero y evento experiment_exposed (A18)', async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await pinSession(page, 'b');
    const api = await mockApi(page);
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/Especialízate con IA/);
    await expect.poll(() => api.trackingEvents.find((e) => e.event === 'experiment_exposed')?.experiment).toEqual({
      id: 'hero-copy',
      variant: 'b',
    });
    await context.close();
  });

  test('FAQ con <details> nativo operable con teclado y comparador accesible (A11, A26)', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    const firstSummary = page.getByTestId('faq').locator('summary').first();
    await firstSummary.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('faq').locator('details').first()).toHaveAttribute('open', '');

    await page.getByTestId('compare-toggle').click();
    const table = page.getByTestId('promotion-comparison').getByRole('table');
    await expect(table).toBeVisible();
    await expect(table.locator('caption')).toHaveText(/Comparación de promociones/);
    await expect(table.getByRole('columnheader')).toHaveCount(3);
  });

  test('tarjeta de sede con «Cómo llegar» y pie con Libro de Reclamaciones (A25, A5)', async ({ page }) => {
    await mockApi(page);
    await page.goto('/');
    const card = page.getByTestId('campus-card');
    await expect(card).toContainText('Calle Deustua 270');
    await expect(card.getByRole('link', { name: /Cómo llegar/ })).toHaveAttribute('href', /google\.com\/maps/);
    await expect(card.getByRole('link', { name: '052-350006' })).toHaveAttribute('href', 'tel:+5152350006');
    await expect(page.getByTestId('footer-complaints-link')).toHaveAttribute('href', '/libro-de-reclamaciones');
    await expect(page.getByTestId('testimonials')).toHaveCount(0);
    await expect(page.getByTestId('start-dates')).toHaveCount(0);
  });

  test('cabeceras de seguridad: CSP con nonce por petición y JSON-LD con nonce (C1, C28)', async ({ page, request }) => {
    const first = await request.get('/');
    const second = await request.get('/');
    const csp = first.headers()['content-security-policy'] ?? '';
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toContain('unsafe-eval');
    expect(second.headers()['content-security-policy']).not.toBe(csp);
    expect(first.headers()['cross-origin-opener-policy']).toBe('same-origin');
    expect(first.headers()['cross-origin-resource-policy']).toBe('same-origin');
    expect(first.headers()['x-dns-prefetch-control']).toBe('off');

    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    const html = await first.text();
    expect(html).toContain(`<script type="application/ld+json" nonce="${nonce}"`);

    // Sin errores de CSP al cargar la página real.
    const violations: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error' && /Content Security Policy/i.test(msg.text())) violations.push(msg.text());
    });
    await mockApi(page);
    await page.goto('/');
    await expect(page.getByTestId('lead-form')).toBeVisible();
    expect(violations).toEqual([]);
  });

  test('POST /api/revalidate exige el secreto (B8)', async ({ request }) => {
    expect((await request.post('/api/revalidate', { data: { tags: ['catalog'] } })).status()).toBe(401);
    const ok = await request.post('/api/revalidate', {
      data: { tags: ['catalog'] },
      headers: { 'x-revalidate-secret': 'e2e-revalidate-secret' },
    });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toMatchObject({ revalidated: ['catalog'] });
    const bad = await request.post('/api/revalidate', {
      data: { tags: ['otra'] },
      headers: { 'x-revalidate-secret': 'e2e-revalidate-secret' },
    });
    expect(bad.status()).toBe(400);
  });

  test('la página de privacidad enlaza a derechos ARCO y al historial de versiones', async ({ page }) => {
    await page.goto('/politica-de-privacidad');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Política de privacidad');
    await expect(page.getByRole('main').getByText('Ley N.º 29733').first()).toBeVisible();
    await page.getByRole('link', { name: 'formulario de derechos ARCO' }).click();
    await expect(page).toHaveURL(/\/derechos-arco$/);
    await page.goto('/politica-de-privacidad/versiones');
    await expect(page.getByTestId('privacy-versions')).toContainText('Versión 2026-11');
    await expect(page.getByTestId('privacy-versions')).toContainText('13 de noviembre de 2026');
  });

  test('la confirmación reabierta sin token no expone el estado', async ({ page }) => {
    await mockApi(page);
    await page.goto(`/solicitud/${leadResponse.leadId}`);
    await expect(page.getByRole('heading', { name: 'No encontramos esta solicitud' })).toBeVisible();
  });
});

test.describe('Móvil', () => {
  test('botón flotante «Solicitar catálogo» y «Llamar» solo con el formulario fuera de pantalla (A14, A22)', async ({ page, isMobile }) => {
    await pinSession(page, 'a');
    await mockApi(page);
    await page.goto('/');
    const cta = page.getByTestId('floating-cta');
    const call = page.getByTestId('call-button');
    if (!isMobile) {
      await expect(page.getByTestId('mobile-actions')).toBeHidden();
      return;
    }
    // En móvil, al cargar el formulario está bajo el hero: la barra es visible.
    await expect(cta).toBeVisible();
    await expect(call).toHaveAttribute('href', 'tel:+5152350006');
    await cta.click();
    await expect(page.getByLabel('Nombre y apellidos')).toBeFocused();
    // Con el formulario en pantalla la barra se oculta (aria-hidden + inert).
    await expect(page.getByTestId('mobile-actions').locator('> div')).toHaveAttribute('aria-hidden', 'true');
  });
});
