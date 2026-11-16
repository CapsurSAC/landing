import { InMemoryMetaCapiEventRepository } from '../../../test/fakes/in-memory-repositories';
import { EVENT_ID, FixedClock, LEAD_ID, leadCreatedPayload } from '../../../test/fakes/support';
import { IntegrationError } from '../../domain/integration-error';
import { type MetaEventsRequest } from '../../domain/meta-capi';
import { HttpMetaCapiClient } from '../../infrastructure/meta/http-meta-capi-client';
import { type MetaCapiClient, type MetaCapiResponse } from '../ports/meta-capi-client';
import { SendMetaLeadEvent } from './send-meta-lead-event';

class FakeMetaClient implements MetaCapiClient {
  readonly requests: MetaEventsRequest[] = [];
  failures: IntegrationError[] = [];

  async sendEvents(request: MetaEventsRequest): Promise<MetaCapiResponse> {
    this.requests.push(request);
    const failure = this.failures.shift();
    if (failure) {
      throw failure;
    }
    return { eventsReceived: 1, fbtraceId: 'trace-1' };
  }
}

function setup(client: MetaCapiClient | null = new FakeMetaClient(), testEventCode: string | null = null) {
  const events = new InMemoryMetaCapiEventRepository();
  const useCase = new SendMetaLeadEvent({ client, events, clock: new FixedClock(), testEventCode });
  return { events, useCase };
}

const input = { eventId: EVENT_ID, attempt: 1, maxAttempts: 5 };

describe('SendMetaLeadEvent (A17)', () => {
  it('sin pixel o token (cliente null) no envía nada', async () => {
    const { events, useCase } = setup(null);
    expect(await useCase.execute({ ...input, payload: leadCreatedPayload() })).toEqual({ status: 'skipped', reason: 'disabled' });
    expect(events.records.size).toBe(0);
  });

  it('sin consentimiento de marketing no envía y lo registra como SKIPPED', async () => {
    const client = new FakeMetaClient();
    const { events, useCase } = setup(client);
    const payload = leadCreatedPayload({
      consent: { contactAccepted: true, marketingAccepted: false, privacyVersion: '2026-11', acceptedAt: '2026-11-13T14:59:00.000Z' },
    });

    expect(await useCase.execute({ ...input, payload })).toEqual({ status: 'skipped', reason: 'no_consent' });
    expect(client.requests).toHaveLength(0);
    expect(events.records.get(LEAD_ID)?.status).toBe('SKIPPED');
  });

  it('con consentimiento envía el evento con test_event_code y es idempotente por lead', async () => {
    const client = new FakeMetaClient();
    const { events, useCase } = setup(client, 'TEST42');

    const first = await useCase.execute({ ...input, payload: leadCreatedPayload() });
    const second = await useCase.execute({ ...input, eventId: 'otro-envio', payload: leadCreatedPayload() });

    expect(first).toEqual({ status: 'sent', fbtraceId: 'trace-1' });
    expect(second).toEqual({ status: 'skipped', reason: 'already_sent' });
    expect(client.requests).toHaveLength(1);
    expect(client.requests[0]!.test_event_code).toBe('TEST42');
    expect(events.records.get(LEAD_ID)).toMatchObject({ status: 'SENT', attempts: 1, fbtraceId: 'trace-1' });
  });

  it('error reintentable con intentos restantes: relanza; en el 5.º intento: failed (DLQ)', async () => {
    const client = new FakeMetaClient();
    client.failures = [IntegrationError.retryable('503', { httpStatus: 503 }), IntegrationError.retryable('503', { httpStatus: 503 })];
    const { events, useCase } = setup(client);

    await expect(useCase.execute({ ...input, attempt: 4, payload: leadCreatedPayload() })).rejects.toBeInstanceOf(IntegrationError);
    expect(events.records.size).toBe(0);

    const last = await useCase.execute({ ...input, attempt: 5, payload: leadCreatedPayload() });
    expect(last).toMatchObject({ status: 'failed', exhausted: true });
    expect(events.records.get(LEAD_ID)).toMatchObject({ status: 'FAILED', attempts: 5 });
  });

  it('error definitivo (4xx): failed sin reintentar', async () => {
    const client = new FakeMetaClient();
    client.failures = [IntegrationError.permanent('token inválido', { httpStatus: 400 })];
    const { useCase } = setup(client);

    expect(await useCase.execute({ ...input, payload: leadCreatedPayload() })).toMatchObject({ status: 'failed', exhausted: false });
  });
});

describe('HttpMetaCapiClient', () => {
  function fakeFetch(status: number, body: unknown) {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    };
    return { calls, fetchImpl: fetchImpl as typeof fetch };
  }

  const options = { baseUrl: 'https://graph.facebook.com/v21.0', pixelId: '123', accessToken: 'tok' };
  const request: MetaEventsRequest = { data: [] };

  it('POST /{pixel}/events con el token en el cuerpo (nunca en la URL)', async () => {
    const { calls, fetchImpl } = fakeFetch(200, { events_received: 1, fbtrace_id: 'abc' });
    const client = new HttpMetaCapiClient(options, fetchImpl);

    expect(await client.sendEvents(request)).toEqual({ eventsReceived: 1, fbtraceId: 'abc' });
    expect(calls[0]!.url).toBe('https://graph.facebook.com/v21.0/123/events');
    expect(JSON.parse(String(calls[0]!.init.body))).toMatchObject({ access_token: 'tok', data: [] });
  });

  it('clasifica errores: 5xx e is_transient reintentables; 400 definitivo', async () => {
    const server = new HttpMetaCapiClient(options, fakeFetch(500, {}).fetchImpl);
    await expect(server.sendEvents(request)).rejects.toMatchObject({ kind: 'retryable', httpStatus: 500 });

    const transient = new HttpMetaCapiClient(options, fakeFetch(400, { error: { message: 'limit', code: 4, is_transient: true } }).fetchImpl);
    await expect(transient.sendEvents(request)).rejects.toMatchObject({ kind: 'retryable', code: 'META_TRANSIENT' });

    const invalid = new HttpMetaCapiClient(options, fakeFetch(400, { error: { message: 'Invalid OAuth', code: 190 } }).fetchImpl);
    await expect(invalid.sendEvents(request)).rejects.toMatchObject({ kind: 'permanent', httpStatus: 400 });
  });
});
