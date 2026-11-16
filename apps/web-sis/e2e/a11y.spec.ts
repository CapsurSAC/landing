import { test } from '@playwright/test';
import { expectNoSeriousA11yViolations, mockApi, pinSession } from './support';

/** A29: auditoría axe sin violaciones serious/critical en las páginas clave. */
const PAGES = [
  { name: 'landing', path: '/' },
  { name: 'libro de reclamaciones', path: '/libro-de-reclamaciones' },
  { name: 'derechos ARCO', path: '/derechos-arco' },
  { name: 'especialidad', path: '/especialidades/ciberseguridad-4-0' },
];

for (const { name, path } of PAGES) {
  test(`axe: ${name}`, async ({ page }) => {
    await pinSession(page, 'a');
    await mockApi(page);
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    await expectNoSeriousA11yViolations(page);
  });
}

test('axe: landing con errores de validación y comparador abierto', async ({ page }) => {
  await pinSession(page, 'a');
  await mockApi(page);
  await page.goto('/');
  await page.getByTestId('submit-lead').click();
  await page.getByTestId('compare-toggle').click();
  await page.getByTestId('promotion-comparison').waitFor();
  await expectNoSeriousA11yViolations(page);
});
