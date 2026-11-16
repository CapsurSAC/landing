import { REDACTED } from '../logging/redaction';
import { scrubSentryEvent, type SentryEventLike } from './scrub';

describe('scrubSentryEvent (C23)', () => {
  it('elimina cuerpo, cookies, query y cabeceras sensibles y redacta PII', () => {
    const event: SentryEventLike = {
      message: 'Fallo al sincronizar ana@example.com',
      request: {
        url: 'https://api.sis.edu.pe/api/v1/leads',
        method: 'POST',
        data: { fullName: 'Ana Pérez', phone: '+51987654321' },
        cookies: { _fbp: 'fb.1.123' },
        query_string: 'email=ana@example.com',
        headers: {
          Authorization: 'Bearer secreto',
          cookie: 'sid=1',
          'x-lead-token': 'tok',
          api_access_token: 'cw',
          'user-agent': 'Mozilla/5.0',
        },
      },
      user: { id: 'u-1', email: 'ana@example.com', ip_address: '203.0.113.7' },
      extra: { lead: { phone: '+51987654321', reference: 'SIS-ABC12' } },
      contexts: { payload: { consumer: { phone_number: '+51987654321' } } },
      breadcrumbs: [{ message: 'llamada a +51 987 654 321', data: { email: 'ana@example.com', status: 500 } }],
      exception: { values: [{ type: 'Error', value: 'Contacto 987654321 duplicado' }] },
    };

    const scrubbed = scrubSentryEvent(event);
    const serialized = JSON.stringify(scrubbed);

    expect(scrubbed.request).not.toHaveProperty('data');
    expect(scrubbed.request).not.toHaveProperty('cookies');
    expect(scrubbed.request).not.toHaveProperty('query_string');
    expect(scrubbed.request?.headers).toEqual({ 'user-agent': 'Mozilla/5.0' });
    expect(scrubbed.user).toEqual({ id: 'u-1' });
    expect(scrubbed.extra).toEqual({ lead: { phone: REDACTED, reference: 'SIS-ABC12' } });
    expect(scrubbed.contexts).toEqual({ payload: { consumer: REDACTED } });
    expect(scrubbed.breadcrumbs?.[0]?.data).toEqual({ email: REDACTED, status: 500 });
    for (const secret of ['ana@example.com', '+51987654321', '987654321', 'secreto', 'Ana Pérez', '203.0.113.7']) {
      expect(serialized).not.toContain(secret);
    }
    expect(scrubbed.message).toBe(`Fallo al sincronizar ${REDACTED}`);
  });

  it('tolera eventos mínimos', () => {
    expect(scrubSentryEvent({})).toEqual({});
  });
});
