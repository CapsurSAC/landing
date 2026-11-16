import { FakeChatwootGateway } from '../../../test/fakes/fake-chatwoot-gateway';
import {
  InMemoryAttemptRepository,
  InMemoryContactLinkRepository,
  InMemoryFollowupRepository,
  InMemorySyncJobRepository,
} from '../../../test/fakes/in-memory-repositories';
import { EVENT_ID, FixedClock, LEAD_ID, leadCreatedPayload } from '../../../test/fakes/support';
import { FOLLOWUP_RETRY_DELAY_MS, ProcessWhatsappFollowups } from './process-whatsapp-followups';

async function setup(options: { campus?: 'tacna' | 'arequipa' } = {}) {
  const gateway = new FakeChatwootGateway();
  const followups = new InMemoryFollowupRepository();
  const contactLinks = new InMemoryContactLinkRepository();
  const syncJobs = new InMemorySyncJobRepository();
  const attempts = new InMemoryAttemptRepository();
  const clock = new FixedClock();
  const payload = leadCreatedPayload({ campus: options.campus ?? 'tacna' });
  await syncJobs.upsertPending({ leadId: LEAD_ID, eventId: EVENT_ID, reference: payload.reference, payload, attempt: 1 });
  await contactLinks.upsert({ leadId: LEAD_ID, reference: payload.reference, crmAccountId: '1', crmContactId: '501', labels: [], syncedAt: clock.now() });
  await followups.schedule(LEAD_ID, new Date(clock.now().getTime() + 24 * 3600 * 1000));
  const useCase = new ProcessWhatsappFollowups({
    gateway,
    followups,
    contactLinks,
    syncJobs,
    attempts,
    clock,
    template: { name: 'sis_catalogo', language: 'es_PE' },
    inboxForCampus: (campus) => (campus === 'arequipa' ? 2 : 1),
  });
  return { gateway, followups, contactLinks, syncJobs, attempts, clock, useCase };
}

describe('ProcessWhatsappFollowups (A6)', () => {
  it('no hace nada antes de AFTER_HOURS', async () => {
    const deps = await setup();
    deps.clock.advance(23 * 3600 * 1000);

    const result = await deps.useCase.execute();

    expect(result.claimed).toBe(0);
    expect(deps.gateway.templateConversations).toHaveLength(0);
  });

  it('vencido y sin conversación: crea la conversación con plantilla en la bandeja de la sede, una sola vez', async () => {
    const deps = await setup({ campus: 'arequipa' });
    deps.clock.advance(24 * 3600 * 1000);

    const first = await deps.useCase.execute();
    deps.clock.advance(FOLLOWUP_RETRY_DELAY_MS * 10);
    const second = await deps.useCase.execute();

    expect(first).toMatchObject({ claimed: 1, sent: 1 });
    expect(second.claimed).toBe(0);
    expect(deps.gateway.templateConversations).toHaveLength(1);
    expect(deps.gateway.templateConversations[0]).toMatchObject({
      inboxId: 2,
      contactId: '501',
      template: {
        name: 'sis_catalogo',
        category: 'UTILITY',
        language: 'es_PE',
        processedParams: { '1': 'María', '2': 'Computación e Informática con IA', '3': 'SIS-7K3M2' },
      },
    });
    const row = deps.followups.rows.get(LEAD_ID)!;
    expect(row).toMatchObject({ status: 'SENT', attempts: 1, templateName: 'sis_catalogo' });
    expect(row.crmConversationId).not.toBeNull();
    expect(await deps.followups.isFollowupConversation(row.crmConversationId!)).toBe(true);
    expect(deps.attempts.attempts.find((attempt) => attempt.operation === 'followup')?.status).toBe('SUCCESS');
  });

  it('si el contacto ya escribió (conversación vinculada) se omite', async () => {
    const deps = await setup();
    await deps.contactLinks.markConversationLinked(LEAD_ID, {
      crmConversationId: '42',
      crmInboxId: '1',
      assignedTo: null,
      assignedToName: null,
      conversationLinkedAt: deps.clock.now(),
    });
    deps.clock.advance(25 * 3600 * 1000);

    const result = await deps.useCase.execute();

    expect(result).toMatchObject({ claimed: 1, skipped: 1, sent: 0 });
    expect(deps.followups.rows.get(LEAD_ID)).toMatchObject({ status: 'SKIPPED', lastError: 'conversation_exists' });
    expect(deps.gateway.templateConversations).toHaveLength(0);
  });

  it('un fallo reintentable reprograma (máx. 3 intentos) y uno definitivo deja FAILED', async () => {
    const deps = await setup();
    deps.gateway.failWith('createTemplateConversation', 503, 3);
    deps.clock.advance(24 * 3600 * 1000);

    expect(await deps.useCase.execute()).toMatchObject({ rescheduled: 1 });
    expect(deps.followups.rows.get(LEAD_ID)).toMatchObject({ status: 'PENDING', attempts: 1 });

    deps.clock.advance(FOLLOWUP_RETRY_DELAY_MS);
    expect(await deps.useCase.execute()).toMatchObject({ rescheduled: 1 });
    deps.clock.advance(FOLLOWUP_RETRY_DELAY_MS);
    expect(await deps.useCase.execute()).toMatchObject({ failed: 1 });
    expect(deps.followups.rows.get(LEAD_ID)).toMatchObject({ status: 'FAILED', attempts: 3 });

    const permanent = await setup();
    permanent.gateway.failWith('createTemplateConversation', 400);
    permanent.clock.advance(24 * 3600 * 1000);
    expect(await permanent.useCase.execute()).toMatchObject({ failed: 1 });
    expect(permanent.followups.rows.get(LEAD_ID)?.status).toBe('FAILED');
  });

  it('un lead anonimizado no recibe la plantilla', async () => {
    const deps = await setup();
    const link = deps.contactLinks.links.get(LEAD_ID)!;
    deps.contactLinks.links.set(LEAD_ID, { ...link, anonymizedAt: new Date() });
    deps.clock.advance(24 * 3600 * 1000);

    await deps.useCase.execute();

    expect(deps.followups.rows.get(LEAD_ID)).toMatchObject({ status: 'SKIPPED', lastError: 'anonymized' });
  });

  it('el candado vencido (réplica caída) vuelve a estar disponible', async () => {
    const deps = await setup();
    deps.clock.advance(24 * 3600 * 1000);
    await deps.followups.claimDue(deps.clock.now(), 10, 1000);

    expect(await deps.followups.claimDue(deps.clock.now(), 10, 1000)).toHaveLength(0);
    deps.clock.advance(1001);
    const result = await deps.useCase.execute();
    expect(result.sent).toBe(1);
  });
});
