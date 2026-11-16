/**
 * Prueba de carga de POST /api/v1/leads (B18).
 *
 * Objetivo: 50 req/s sostenidas con p95 < 300 ms y < 1 % de errores.
 * Cada petición lleva un Idempotency-Key UUID nuevo (C19) y un teléfono
 * distinto para no chocar con el límite por teléfono (5/h).
 *
 * IMPORTANTE:
 *  - Ejecutar SOLO contra local o staging, nunca contra producción (crea leads,
 *    publica eventos y, si crm-bridge está conectado, crea contactos en Chatwoot:
 *    usar un Chatwoot de pruebas o detener crm-bridge).
 *  - El límite por IP (10/min) y Turnstile bloquean una carga sintética desde
 *    una sola IP: en el entorno de prueba subir LEADS_RATE_LIMIT_PER_MINUTE,
 *    dejar TURNSTILE_SECRET_KEY vacío y apuntar directamente a leads-service
 *    o desactivar el rateLimit del gateway para ese entorno.
 *
 * Uso:
 *   BASE_URL=http://host.docker.internal:3002 pnpm load:leads
 *   docker run --rm -i -e BASE_URL=https://staging.example.com grafana/k6:1.4.2 run - < infrastructure/load/k6-leads.js
 * Variables: BASE_URL, RATE (50), DURATION (2m), PROMOTION_ID (con-ia), BRAND (sis).
 */
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

const BASE_URL = (__ENV.BASE_URL || 'http://host.docker.internal:8080').replace(/\/$/, '');
const RATE = Number(__ENV.RATE || 50);
const DURATION = __ENV.DURATION || '2m';
const PROMOTION_ID = __ENV.PROMOTION_ID || 'con-ia';
const BRAND = __ENV.BRAND || 'sis';

const rejected = new Counter('leads_rejected');

export const options = {
  discardResponseBodies: false,
  scenarios: {
    leads: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: Math.max(20, RATE),
      maxVUs: Math.max(20, RATE) * 4,
    },
  },
  thresholds: {
    'http_req_duration{scenario:leads}': ['p(95)<300'],
    http_req_failed: ['rate<0.01'],
    checks: ['rate>0.99'],
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
};

/** Teléfono móvil peruano sintético y único por iteración (9 + 8 dígitos). */
function syntheticPhone() {
  const n = (Date.now() * 1000 + Math.floor(Math.random() * 1000)) % 100000000;
  return `9${String(n).padStart(8, '0')}`;
}

export default function () {
  const phone = syntheticPhone();
  const body = JSON.stringify({
    brand: BRAND,
    promotionId: PROMOTION_ID,
    fullName: 'Prueba de Carga',
    phone,
    phoneCountry: 'PE',
    email: `carga+${phone}@example.com`,
    campus: 'tacna',
    consent: { contactAccepted: true, marketingAccepted: false, privacyVersion: '2026-11' },
    attribution: { utmSource: 'k6', utmCampaign: 'carga' },
  });

  const res = http.post(`${BASE_URL}/api/v1/leads`, body, {
    headers: {
      'content-type': 'application/json',
      // UUID v4 con WebCrypto (estable en k6 1.x), sin dependencias remotas.
      'idempotency-key': crypto.randomUUID(),
      'user-agent': 'capsur-k6-load-test',
    },
    tags: { endpoint: 'POST /api/v1/leads' },
  });

  const ok = check(res, {
    'status 200/201': (r) => r.status === 201 || r.status === 200,
    'devuelve reference': (r) => {
      try {
        return typeof r.json('reference') === 'string';
      } catch {
        return false;
      }
    },
  });
  if (!ok) rejected.add(1, { status: String(res.status) });
}
