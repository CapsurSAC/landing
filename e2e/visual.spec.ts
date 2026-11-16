import { expect, test } from '@playwright/test';
import { mockApi, pinSession } from './support';

/**
 * B28: regresión visual de la landing en los tres anchos del diseño aprobado.
 * Datos deterministas: catálogo de respaldo (servicios apagados), API
 * interceptada, variante «a» del experimento y sin animaciones.
 */
const WIDTHS = [375, 1024, 1366] as const;

for (const width of WIDTHS) {
  test(`landing ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 729 });
    await pinSession(page, 'a');
    await mockApi(page);
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    // Las imágenes con loading="lazy" deben estar cargadas antes de la captura de página completa.
    await page.evaluate(async () => {
      for (const img of Array.from(document.images)) {
        img.loading = 'eager';
        if (!img.complete) {
          await new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        }
      }
    });
    await expect(page).toHaveScreenshot(`landing-${width}.png`, { fullPage: true });
  });
}

test('libro de reclamaciones 375px', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 729 });
  await pinSession(page, 'a');
  await mockApi(page);
  await page.goto('/libro-de-reclamaciones');
  await page.evaluate(() => document.fonts.ready);
  await expect(page).toHaveScreenshot('libro-375.png', { fullPage: true });
});
