import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, type Request } from '@playwright/test';
import { assignVariant, HERO_COPY_EXPERIMENT, SESSION_STORAGE_KEY } from '../src/lib/experiments';

export const STATUS_TOKEN = 'tok_e2e_abcdefghijklmnopqrstuvwxyz';

export const leadResponse = {
  leadId: '0b4cf28e-10c8-4a00-8cc6-510c6d5b772d',
  reference: 'SIS-7K3M2',
  status: 'registered',
  phone: '+51987654321',
  campus: 'tacna',
  promotion: { id: 'con-ia', name: 'CON IA', headline: 'S/249' },
  specialties: [],
  whatsapp: {
    number: '51987654321',
    prefilledMessage: 'Hola',
    url: 'https://wa.me/51987654321?text=Hola',
  },
  statusToken: STATUS_TOKEN,
  replayed: false,
};

export interface MockedApi {
  trackingEvents: Array<Record<string, unknown>>;
  statusRequests: Request[];
  feedbackRequests: Request[];
}

/** Intercepta toda la API pública; nada sale a la red real. */
export async function mockApi(page: Page, options: { leadStatus?: number; statusAfter?: string } = {}): Promise<MockedApi> {
  const api: MockedApi = { trackingEvents: [], statusRequests: [], feedbackRequests: [] };
  await page.route('**/api/v1/tracking/events', (route) => {
    api.trackingEvents.push(route.request().postDataJSON() as Record<string, unknown>);
    return route.fulfill({ status: 202, json: { accepted: true } });
  });
  await page.route('**/api/v1/leads', async (route) => {
    const headers = route.request().headers();
    if (!headers['idempotency-key']) {
      return route.fulfill({ status: 400, json: { title: 'Falta Idempotency-Key', status: 400, code: 'IDEMPOTENCY_KEY_REQUIRED' } });
    }
    return route.fulfill({ status: options.leadStatus ?? 201, json: leadResponse });
  });
  await page.route('**/api/v1/leads/*/status', (route) => {
    api.statusRequests.push(route.request());
    if (route.request().headers()['x-lead-token'] !== STATUS_TOKEN) {
      return route.fulfill({ status: 404, json: { title: 'No encontrado', status: 404 } });
    }
    return route.fulfill({
      status: 200,
      json: {
        leadId: leadResponse.leadId,
        reference: leadResponse.reference,
        status: options.statusAfter ?? 'crm_synced',
        updatedAt: '2026-11-13T12:00:05.000Z',
      },
    });
  });
  await page.route('**/api/v1/leads/*/feedback', (route) => {
    api.feedbackRequests.push(route.request());
    return route.fulfill({ status: 202, json: { accepted: true } });
  });
  await page.route('**/api/v1/complaints', (route) =>
    route.fulfill({
      status: 201,
      json: {
        complaintId: '6f1c2a4e-1d2b-4c3d-9e8f-001122334455',
        code: 'SIS-LR-2026-000123',
        receivedAt: '2026-11-13T15:00:00.000Z',
        responseDueBy: '2026-12-04T15:00:00.000Z',
      },
    }),
  );
  await page.route('**/api/v1/privacy/requests', (route) =>
    route.fulfill({
      status: 201,
      json: {
        requestId: '7a1c2a4e-1d2b-4c3d-9e8f-001122334455',
        code: 'SIS-ARCO-2026-000045',
        receivedAt: '2026-11-13T15:00:00.000Z',
        responseDueBy: '2026-12-11T15:00:00.000Z',
      },
    }),
  );
  return api;
}

/** Devuelve un sessionId que cae en la variante pedida del experimento del hero. */
export function sessionIdForVariant(variant: 'a' | 'b'): string {
  for (let i = 0; i < 10_000; i += 1) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    if (assignVariant(HERO_COPY_EXPERIMENT, id) === variant) return id;
  }
  throw new Error('sin sessionId para la variante');
}

/** Fija el sessionId antes de que corra el script en línea del experimento. */
export async function pinSession(page: Page, variant: 'a' | 'b' = 'a'): Promise<string> {
  const id = sessionIdForVariant(variant);
  await page.addInitScript(
    ([key, value]) => {
      if (!window.sessionStorage.getItem(key)) window.sessionStorage.setItem(key, value);
    },
    [SESSION_STORAGE_KEY, id] as const,
  );
  return id;
}

/** A29: sin violaciones serious/critical de WCAG 2.x A/AA. */
export async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(
    serious.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) })),
  ).toEqual([]);
}
