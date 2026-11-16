import { FakeChatwootGateway } from '../../../test/fakes/fake-chatwoot-gateway';
import {
  InMemoryAttemptRepository,
  InMemoryContactLinkRepository,
  InMemoryPersonalDataEraser,
  InMemorySyncJobRepository,
  InMemoryWebhookEventRepository,
} from '../../../test/fakes/in-memory-repositories';
import { EVENT_ID, FixedClock, LEAD_ID, leadCreatedPayload } from '../../../test/fakes/support';
import { IntegrationError } from '../../domain/integration-error';
import { AnonymizeLead } from './anonymize-lead';
import { ApplyLeadFeedback } from './apply-lead-feedback';
import { GetIntegrationSummary, SERVICE_QUEUES } from './get-integration-summary';

async function seed() {
  const gateway = new FakeChatwootGateway();
  const contactLinks = new InMemoryContactLinkRepository();
  const syncJobs = new InMemorySyncJobRepository();
  const webhookEvents = new InMemoryWebhookEventRepository();
  const attempts = new InMemoryAttemptRepository();
  const clock = new FixedClock();
  const payload = leadCreatedPayload();
  gateway.seedContact({ id: '501', phoneNumber: payload.phone, customAttributes: { lead_reference: payload.reference } });
  await syncJobs.upsertPending({ leadId: LEAD_ID, eventId: EVENT_ID, reference: payload.reference, payload, attempt: 1 });
  await syncJobs.update(LEAD_ID, { status: 'SUCCEEDED', lastError: 'Chatwoot respondió 422: +51987654321 ya existe' });
  await contactLinks.upsert({ leadId: LEAD_ID, reference: payload.reference, crmAccountId: '1', crmContactId: '501', labels: [], syncedAt: clock.now() });
  await contactLinks.markConversationLinked(LEAD_ID, {
    crmConversationId: '42',
    crmInboxId: '1',
    assignedTo: null,
    assignedToName: null,
    conversationLinkedAt: clock.now(),
  });
  await webhookEvents.createIfAbsent({
    dedupeKey: 'message_created:42:1',
    eventType: 'message_created',
    conversationId: '42',
    contactId: '501',
    payload: { content: 'Soy María, mi DNI es…' },
    signatureValid: true,
    receivedAt: clock.now(),
  });
  return { gateway, contactLinks, syncJobs, webhookEvents, attempts, clock };
}

describe('ApplyLeadFeedback (A21)', () => {
  const feedback = { leadId: LEAD_ID, reference: 'SIS-7K3M2', source: 'tiktok' as const, detail: 'un video', receivedAt: '2026-11-13T16:00:00.000Z' };

  it('guarda how_heard conservando los atributos existentes', async () => {
    const deps = await seed();
    const useCase = new ApplyLeadFeedback(deps);

    expect(await useCase.execute(EVENT_ID, feedback)).toEqual({ status: 'updated', crmContactId: '501' });
    expect(deps.gateway.contacts.get('501')?.customAttributes).toEqual({
      lead_reference: 'SIS-7K3M2',
      how_heard: 'tiktok',
      how_heard_detail: 'un video',
    });
  });

  it('sin reintentos: un fallo de Chatwoot se registra y se devuelve failed (nunca lanza)', async () => {
    const deps = await seed();
    deps.gateway.failWith('updateContactAttributes', 503);
    const useCase = new ApplyLeadFeedback(deps);

    expect(await useCase.execute(EVENT_ID, feedback)).toMatchObject({ status: 'failed' });
    expect(deps.attempts.attempts.find((attempt) => attempt.operation === 'feedback')?.status).toBe('RETRYABLE_FAILURE');
  });

  it('lead no sincronizado: se descarta', async () => {
    const deps = await seed();
    const useCase = new ApplyLeadFeedback(deps);
    expect(await useCase.execute(EVENT_ID, { ...feedback, leadId: '11111111-1111-4111-8111-111111111111' })).toEqual({
      status: 'skipped',
      reason: 'contact_not_synced',
    });
  });
});

describe('AnonymizeLead (C9)', () => {
  const event = {
    leadId: LEAD_ID,
    reference: 'SIS-7K3M2',
    reason: 'arco_request' as const,
    deleteCrmContact: true,
    anonymizedAt: '2026-11-13T16:00:00.000Z',
  };

  function build(deps: Awaited<ReturnType<typeof seed>>) {
    const eraser = new InMemoryPersonalDataEraser(deps.syncJobs, deps.contactLinks, deps.webhookEvents);
    return { eraser, useCase: new AnonymizeLead({ ...deps, eraser }) };
  }

  it('borra payload y error del job, cuerpos de webhooks y elimina el contacto en Chatwoot', async () => {
    const deps = await seed();
    const { eraser, useCase } = build(deps);

    const result = await useCase.execute(event);

    expect(result.crmContact).toBe('deleted');
    expect(eraser.calls[0]).toEqual({ leadId: LEAD_ID, crmContactId: '501', crmConversationId: '42' });
    const job = deps.syncJobs.jobs.get(LEAD_ID)!;
    expect(job.payload).toBeNull();
    expect(job.lastError).toBeNull();
    expect(job.anonymizedAt).not.toBeNull();
    expect(deps.webhookEvents.events.get('message_created:42:1')?.payload).toEqual({ anonymized: true });
    expect(deps.gateway.contacts.has('501')).toBe(false);
  });

  it('sin deleteCrmContact conserva el contacto en Chatwoot', async () => {
    const deps = await seed();
    const { useCase } = build(deps);

    expect((await useCase.execute({ ...event, deleteCrmContact: false })).crmContact).toBe('kept');
    expect(deps.gateway.calledMethods()).not.toContain('deleteContact');
  });

  it('es idempotente: un contacto ya borrado cuenta como not_found', async () => {
    const deps = await seed();
    const { useCase } = build(deps);
    await useCase.execute(event);

    expect((await useCase.execute(event)).crmContact).toBe('not_found');
  });

  it('un fallo reintentable de Chatwoot se relanza (el consumidor reencola) tras borrar lo local', async () => {
    const deps = await seed();
    deps.gateway.failWith('deleteContact', 503);
    const { useCase } = build(deps);

    await expect(useCase.execute(event)).rejects.toBeInstanceOf(IntegrationError);
    expect(deps.syncJobs.jobs.get(LEAD_ID)?.payload).toBeNull();
  });

  it('un 4xx definitivo al borrar en Chatwoot no se reintenta', async () => {
    const deps = await seed();
    deps.gateway.failWith('deleteContact', 403);
    const { useCase } = build(deps);

    expect((await useCase.execute(event)).crmContact).toBe('failed');
  });
});

describe('GetIntegrationSummary (A27)', () => {
  it('cuenta por estado, consulta todas las colas (incluidas .retry y .dlq) y omite las que fallan', async () => {
    const deps = await seed();
    const consulted: string[] = [];
    const summary = new GetIntegrationSummary({
      syncJobs: deps.syncJobs,
      contactLinks: deps.contactLinks,
      chatwootConfigured: false,
      queues: {
        stats: async (queue) => {
          consulted.push(queue);
          if (queue.endsWith('.retry')) {
            throw new Error('NOT_FOUND');
          }
          return { messageCount: queue.endsWith('.dlq') ? 2 : 0, consumerCount: queue.endsWith('.dlq') ? 0 : 1 };
        },
      },
    });

    const result = await summary.execute();

    expect(consulted.sort()).toEqual([...SERVICE_QUEUES].sort());
    expect(result.jobs).toEqual({ pending: 0, succeeded: 1, failed: 0, dead: 0 });
    expect(result.queues).toContainEqual({ name: 'crm-bridge.meta-capi.dlq', messages: 2, consumers: 0 });
    expect(result.queues.map((queue) => queue.name)).not.toContain('crm-bridge.meta-capi.retry');
    expect(result.lastSyncAt).toBe('2026-11-13T15:00:00.000Z');
    expect(result.chatwootConfigured).toBe(false);
  });
});
