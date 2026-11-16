import { createHash } from 'node:crypto';
import { leadCreatedPayload, LEAD_ID } from '../../test/fakes/support';
import { buildMetaLeadEvent, normalizeEmail, normalizePhone, resolveFbc, sha256Hex } from './meta-capi';

const sha = (value: string): string => createHash('sha256').update(value).digest('hex');

describe('Meta Conversions API: evento Lead (A17)', () => {
  it('normaliza correo y teléfono según Meta', () => {
    expect(normalizeEmail('  Maria.Quispe@Example.COM ')).toBe('maria.quispe@example.com');
    expect(normalizePhone('+51 987-654-321')).toBe('51987654321');
    expect(sha256Hex('abc')).toBe(sha('abc'));
  });

  it('envía em/ph en SHA-256 normalizados, datos técnicos sin hash y event_id = leadId', () => {
    const payload = leadCreatedPayload({
      email: 'Maria@Example.com',
      client: {
        ipAddress: '203.0.113.7',
        userAgent: 'Mozilla/5.0',
        fbc: 'fb.1.1700000000000.AbCd',
        fbp: 'fb.1.1700000000000.123456',
        eventSourceUrl: 'https://sis.edu.pe/?utm_source=meta',
      },
    });

    const request = buildMetaLeadEvent(payload);
    const [event] = request.data;

    expect(request.test_event_code).toBeUndefined();
    expect(event).toMatchObject({
      event_name: 'Lead',
      event_id: LEAD_ID,
      action_source: 'website',
      event_time: Math.floor(Date.parse(payload.createdAt) / 1000),
      event_source_url: 'https://sis.edu.pe/?utm_source=meta',
      user_data: {
        em: [sha('maria@example.com')],
        ph: [sha('51987654321')],
        external_id: [sha(LEAD_ID)],
        client_ip_address: '203.0.113.7',
        client_user_agent: 'Mozilla/5.0',
        fbc: 'fb.1.1700000000000.AbCd',
        fbp: 'fb.1.1700000000000.123456',
      },
      custom_data: { currency: 'PEN', value: 249, content_name: payload.promotion.name, content_ids: ['con-ia'] },
    });
    // Nunca viajan en claro.
    expect(JSON.stringify(request)).not.toContain('maria@example.com');
    expect(JSON.stringify(request)).not.toContain('987654321');
  });

  it('incluye test_event_code si está configurado y valor 0 sin precio', () => {
    const payload = leadCreatedPayload({ promotion: { id: 'con-ia', name: 'Con IA', campaignId: null } });
    const request = buildMetaLeadEvent(payload, { testEventCode: 'TEST123' });
    expect(request.test_event_code).toBe('TEST123');
    expect(request.data[0]!.custom_data.value).toBe(0);
  });

  it('construye fbc desde fbclid si falta la cookie _fbc', () => {
    const payload = leadCreatedPayload({ attribution: { fbclid: 'IwAR123' } });
    expect(resolveFbc(payload)).toBe(`fb.1.${Date.parse(payload.createdAt)}.IwAR123`);
    expect(resolveFbc(leadCreatedPayload({ attribution: {} }))).toBeUndefined();
  });
});
