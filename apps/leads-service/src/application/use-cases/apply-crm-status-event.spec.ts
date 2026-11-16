import { EventNames, type EventEnvelope } from '@capsur/api-contracts';
import {
  FixedClock,
  InMemoryLeadRepository,
  InMemoryProcessedEventRepository,
  InMemoryStore,
  SilentLogger,
  leadFixture,
} from '../../../test/support/fakes';
import { InvalidEventPayloadError } from '../../domain/errors';
import { ApplyCrmStatusEvent } from './apply-crm-status-event';

const NOW = new Date('2026-11-13T15:00:00.000Z');
const LEAD_ID = '5c0f2d8e-1a2b-4c3d-9e8f-0a1b2c3d4e5f';

function envelope(name: string, payload: unknown, id = 'ev000000-0000-4000-8000-000000000001'): EventEnvelope {
  return {
    id,
    name,
    version: 1,
    occurredAt: NOW.toISOString(),
    producer: 'crm-bridge-service',
    correlationId: LEAD_ID,
    payload,
  };
}

function setup() {
  const store = new InMemoryStore();
  const useCase = new ApplyCrmStatusEvent(
    new InMemoryLeadRepository(store),
    new InMemoryProcessedEventRepository(store),
    new FixedClock(NOW),
    new SilentLogger(),
  );
  return { store, useCase };
}

const contactSynced = {
  leadId: LEAD_ID,
  reference: 'SIS-7K3M2',
  crmContactId: 'cw-123',
  crmAccountId: '1',
  labels: ['sis'],
  syncedAt: '2026-11-13T15:00:05.000Z',
};

describe('ApplyCrmStatusEvent', () => {
  it('crm.contact.synced.v1 pasa el lead a CRM_SYNCED y registra el evento', async () => {
    const { store, useCase } = setup();
    store.seedLead(leadFixture({ id: LEAD_ID, status: 'CRM_SYNCING' }));

    const outcome = await useCase.execute(envelope(EventNames.CrmContactSynced, contactSynced));

    expect(outcome).toBe('applied');
    expect(store.leads.get(LEAD_ID)).toMatchObject({
      status: 'CRM_SYNCED',
      crmContactId: 'cw-123',
      crmSyncedAt: new Date('2026-11-13T15:00:05.000Z'),
      updatedAt: NOW,
    });
    expect(store.processedEvents.has('ev000000-0000-4000-8000-000000000001')).toBe(true);
  });

  it('es idempotente: el mismo id de evento no se aplica dos veces', async () => {
    const { store, useCase } = setup();
    store.seedLead(leadFixture({ id: LEAD_ID }));
    const event = envelope(EventNames.CrmContactSynced, contactSynced);
    await useCase.execute(event);
    store.leads.set(LEAD_ID, { ...store.leads.get(LEAD_ID)!, crmContactId: 'manual-change' });

    const outcome = await useCase.execute(event);

    expect(outcome).toBe('already_processed');
    expect(store.leads.get(LEAD_ID)?.crmContactId).toBe('manual-change');
    expect(store.processedEvents.size).toBe(1);
  });

  it('crm.conversation.linked.v1 guarda la conversación e implica CRM_SYNCED', async () => {
    const { store, useCase } = setup();
    store.seedLead(leadFixture({ id: LEAD_ID, status: 'CRM_SYNCING' }));

    const outcome = await useCase.execute(
      envelope(EventNames.CrmConversationLinked, {
        leadId: LEAD_ID,
        reference: 'SIS-7K3M2',
        crmContactId: 'cw-123',
        crmConversationId: 'conv-9',
        inboxId: '2',
        assignedTo: '7',
        assignedToName: 'Lucía Mamani',
        linkedAt: '2026-11-13T15:01:00.000Z',
      }),
    );

    expect(outcome).toBe('applied');
    expect(store.leads.get(LEAD_ID)).toMatchObject({
      status: 'CRM_SYNCED',
      crmContactId: 'cw-123',
      crmConversationId: 'conv-9',
      crmConversationLinkedAt: new Date('2026-11-13T15:01:00.000Z'),
      crmAdvisorName: 'Lucía Mamani',
    });
  });

  it('crm.sync.failed.v1 pasa el lead a CRM_FAILED', async () => {
    const { store, useCase } = setup();
    store.seedLead(leadFixture({ id: LEAD_ID, status: 'CRM_SYNCING' }));

    const outcome = await useCase.execute(
      envelope(EventNames.CrmSyncFailed, {
        leadId: LEAD_ID,
        reference: 'SIS-7K3M2',
        attempts: 5,
        reason: 'timeout',
        failedAt: NOW.toISOString(),
      }),
    );

    expect(outcome).toBe('applied');
    expect(store.leads.get(LEAD_ID)?.status).toBe('CRM_FAILED');
  });

  it('ignora (y marca procesado) un fallo que llega cuando el lead ya está CRM_SYNCED', async () => {
    const { store, useCase } = setup();
    store.seedLead(leadFixture({ id: LEAD_ID, status: 'CRM_SYNCED', crmContactId: 'cw-123' }));

    const outcome = await useCase.execute(
      envelope(EventNames.CrmSyncFailed, {
        leadId: LEAD_ID,
        reference: 'SIS-7K3M2',
        attempts: 5,
        reason: 'tarde',
        failedAt: NOW.toISOString(),
      }),
    );

    expect(outcome).toBe('ignored');
    expect(store.leads.get(LEAD_ID)?.status).toBe('CRM_SYNCED');
    expect(store.processedEvents.size).toBe(1);
  });

  it('un payload inválido lanza InvalidEventPayloadError y no marca el evento como procesado', async () => {
    const { store, useCase } = setup();
    store.seedLead(leadFixture({ id: LEAD_ID }));

    await expect(
      useCase.execute(envelope(EventNames.CrmContactSynced, { leadId: 'no-es-uuid' })),
    ).rejects.toBeInstanceOf(InvalidEventPayloadError);
    expect(store.processedEvents.size).toBe(0);
  });

  it('un lead inexistente se ignora y el evento queda registrado', async () => {
    const { store, useCase } = setup();

    const outcome = await useCase.execute(envelope(EventNames.CrmContactSynced, contactSynced));

    expect(outcome).toBe('ignored');
    expect(store.processedEvents.size).toBe(1);
  });

  it('un evento crm.* desconocido se ignora sin fallar', async () => {
    const { useCase } = setup();

    const outcome = await useCase.execute(envelope('crm.something.else.v1', {}));

    expect(outcome).toBe('ignored');
  });
});
