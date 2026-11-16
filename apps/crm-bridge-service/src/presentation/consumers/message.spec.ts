import { EventNames, LeadCreatedPayloadSchema, Queues } from '@capsur/api-contracts';
import { type ConsumeMessage } from 'amqplib';
import { EVENT_ID, leadCreatedPayload } from '../../../test/fakes/support';
import { forwardProperties, parseEventMessage, readAttempt } from './message';

function death(queue: string, reason: 'rejected' | 'expired', count: number) {
  return { count, reason, queue, time: { '!': 'timestamp' as const, value: 1 }, exchange: '', 'routing-keys': [queue] };
}

function message(content: unknown, headers: Record<string, unknown> = {}): ConsumeMessage {
  return {
    content: Buffer.from(typeof content === 'string' ? content : JSON.stringify(content), 'utf8'),
    fields: { deliveryTag: 1, redelivered: false, exchange: 'capsur.events', routingKey: EventNames.LeadCreated, consumerTag: 'c' },
    properties: {
      contentType: 'application/json',
      contentEncoding: 'utf-8',
      headers,
      deliveryMode: 2,
      priority: undefined,
      correlationId: 'corr',
      replyTo: undefined,
      expiration: undefined,
      messageId: EVENT_ID,
      timestamp: 1700000000,
      type: EventNames.LeadCreated,
      userId: undefined,
      appId: 'leads-service',
      clusterId: undefined,
    },
  };
}

const envelope = {
  id: EVENT_ID,
  name: EventNames.LeadCreated,
  version: 1,
  occurredAt: '2026-11-13T15:00:00.000Z',
  producer: 'leads-service',
  correlationId: 'corr',
  payload: leadCreatedPayload(),
};

describe('readAttempt', () => {
  it('es 1 sin cabecera x-death', () => {
    expect(readAttempt(undefined, Queues.CrmBridgeLeadCreated)).toBe(1);
    expect(readAttempt({}, Queues.CrmBridgeLeadCreated)).toBe(1);
  });

  it('suma solo los rechazos de la cola indicada', () => {
    const headers = {
      'x-death': [
        death(Queues.CrmBridgeMetaCapi, 'rejected', 3),
        death(Queues.CrmBridgeMetaCapiRetry, 'expired', 3),
        death(Queues.CrmBridgeLeadCreated, 'rejected', 1),
      ],
    };
    expect(readAttempt(headers, Queues.CrmBridgeMetaCapi)).toBe(4);
    expect(readAttempt(headers, Queues.CrmBridgeLeadCreated)).toBe(2);
    expect(readAttempt(headers, Queues.CrmBridgeLeadFeedback)).toBe(1);
  });
});

describe('parseEventMessage', () => {
  it('devuelve id del sobre y payload validado', () => {
    const result = parseEventMessage(message(envelope), EventNames.LeadCreated, LeadCreatedPayloadSchema);
    expect(result).toMatchObject({ ok: true, eventId: EVENT_ID, payload: { leadId: envelope.payload.leadId, campus: 'tacna' } });
  });

  it('rechaza JSON inválido, sobre inválido, evento inesperado y payload inválido sin exponer datos', () => {
    expect(parseEventMessage(message('{no'), EventNames.LeadCreated, LeadCreatedPayloadSchema)).toMatchObject({ ok: false, reason: 'not_json' });
    expect(parseEventMessage(message({ foo: 1 }), EventNames.LeadCreated, LeadCreatedPayloadSchema)).toMatchObject({
      ok: false,
      reason: 'invalid_envelope',
    });
    expect(parseEventMessage(message({ ...envelope, name: 'otro.v1' }), EventNames.LeadCreated, LeadCreatedPayloadSchema)).toMatchObject({
      ok: false,
      reason: 'unexpected_event',
    });
    const invalid = parseEventMessage(
      message({ ...envelope, payload: { ...envelope.payload, phone: '987' } }),
      EventNames.LeadCreated,
      LeadCreatedPayloadSchema,
    );
    expect(invalid).toEqual({ ok: false, reason: 'invalid_payload', detail: ['phone'] });
  });
});

describe('forwardProperties', () => {
  it('conserva propiedades del original y añade cabeceras de diagnóstico', () => {
    const forwarded = forwardProperties(message(envelope, { 'x-event-version': 1 }), { 'x-crm-bridge-attempts': 5 });
    expect(forwarded).toMatchObject({
      persistent: true,
      contentType: 'application/json',
      messageId: EVENT_ID,
      appId: 'leads-service',
      headers: { 'x-event-version': 1, 'x-crm-bridge-attempts': 5 },
    });
  });
});
