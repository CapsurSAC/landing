import { EventNames } from '@capsur/api-contracts';
import { FakeChatwootGateway } from '../../../test/fakes/fake-chatwoot-gateway';
import {
  InMemoryAttemptRepository,
  InMemoryContactLinkRepository,
  InMemoryFollowupRepository,
  InMemoryProcessedEventRepository,
  InMemorySyncJobRepository,
} from '../../../test/fakes/in-memory-repositories';
import { EVENT_ID, FakeEventPublisher, FixedClock, LEAD_ID, leadCreatedPayload } from '../../../test/fakes/support';
import { IntegrationError } from '../../domain/integration-error';
import { SyncLeadToChatwoot } from './sync-lead-to-chatwoot';

function setup() {
  const gateway = new FakeChatwootGateway();
  const contactLinks = new InMemoryContactLinkRepository();
  const syncJobs = new InMemorySyncJobRepository();
  const attempts = new InMemoryAttemptRepository();
  const processedEvents = new InMemoryProcessedEventRepository();
  const followups = new InMemoryFollowupRepository();
  const publisher = new FakeEventPublisher();
  const clock = new FixedClock();
  const useCase = new SyncLeadToChatwoot({
    gateway,
    contactLinks,
    syncJobs,
    attempts,
    processedEvents,
    publisher,
    clock,
    crmAccountId: '7',
    inboxForCampus: (campus) => (campus === 'arequipa' ? 4 : 3),
    followup: { repository: followups, afterHours: 24 },
  });
  return { gateway, contactLinks, syncJobs, attempts, processedEvents, followups, publisher, clock, useCase };
}

const baseInput = { eventId: EVENT_ID, attempt: 1, maxAttempts: 5 };

describe('SyncLeadToChatwoot', () => {
  it('crea el contacto con atributos y etiquetas y publica crm.contact.synced.v1', async () => {
    const { gateway, contactLinks, syncJobs, attempts, processedEvents, publisher, useCase } = setup();

    const result = await useCase.execute({ ...baseInput, payload: leadCreatedPayload() });

    expect(result.status).toBe('synced');
    if (result.status !== 'synced') throw new Error('unreachable');
    expect(result.created).toBe(true);

    const createCall = gateway.calls.find((call) => call.method === 'createContact');
    expect(createCall).toBeDefined();
    expect(createCall!.args[0]).toMatchObject({
      inboxId: 3,
      name: 'María Quispe',
      phoneNumber: '+51987654321',
      email: 'maria@example.com',
      customAttributes: {
        lead_reference: 'SIS-7K3M2',
        lead_id: LEAD_ID,
        brand: 'sis',
        promotion_id: 'con-ia',
        promotion_name: 'Computación e Informática con IA',
        campaign_id: 'nov-2026',
        utm_source: 'meta',
        utm_medium: 'paid',
        utm_campaign: 'sis-nov',
        consent_privacy_version: '2026-11',
        consent_marketing: true,
        landing_submitted_at: '2026-11-13T14:59:30.000Z',
      },
    });

    const link = await contactLinks.findByLeadId(LEAD_ID);
    expect(link).not.toBeNull();
    expect(link!.labels).toEqual(['marca-sis', 'promo-con-ia', 'campania-nov-2026', 'sede-tacna', 'origen-landing']);
    expect(gateway.contactLabels.get(link!.crmContactId)).toEqual(['marca-sis', 'promo-con-ia', 'campania-nov-2026', 'sede-tacna', 'origen-landing']);
    expect(link!.crmAccountId).toBe('7');

    expect(syncJobs.jobs.get(LEAD_ID)?.status).toBe('SUCCEEDED');
    expect(await processedEvents.has(EVENT_ID)).toBe(true);
    expect(attempts.attempts).toHaveLength(1);
    expect(attempts.attempts[0]).toMatchObject({ operation: 'sync_contact', status: 'SUCCESS', attempt: 1 });

    const synced = publisher.byName(EventNames.CrmContactSynced);
    expect(synced).toHaveLength(1);
    expect(synced[0]).toMatchObject({ producer: 'crm-bridge-service', correlationId: LEAD_ID, version: 1 });
    expect(synced[0]!.payload).toMatchObject({
      leadId: LEAD_ID,
      reference: 'SIS-7K3M2',
      crmContactId: link!.crmContactId,
      crmAccountId: '7',
      labels: ['marca-sis', 'promo-con-ia', 'campania-nov-2026', 'sede-tacna', 'origen-landing'],
    });
  });

  it('omite la etiqueta de campaña cuando el lead no tiene campaignId', async () => {
    const { contactLinks, useCase } = setup();
    const payload = leadCreatedPayload({ promotion: { id: 'con-ia', name: 'Computación', campaignId: null } });

    await useCase.execute({ ...baseInput, payload });

    const link = await contactLinks.findByLeadId(LEAD_ID);
    expect(link!.labels).toEqual(['marca-sis', 'promo-con-ia', 'sede-tacna', 'origen-landing']);
  });

  it('actualiza un contacto existente (por teléfono) sin crear otro y conserva sus etiquetas', async () => {
    const { gateway, contactLinks, useCase } = setup();
    const existing = gateway.seedContact({ id: '55', phoneNumber: '+51987654321', name: 'Maria', customAttributes: { vip: true } });
    gateway.contactLabels.set('55', ['cliente-antiguo']);

    const result = await useCase.execute({ ...baseInput, payload: leadCreatedPayload() });

    expect(result.status).toBe('synced');
    expect(gateway.calledMethods()).not.toContain('createContact');
    expect(gateway.calledMethods()).toContain('updateContact');
    expect(gateway.contacts.get(existing.id)?.name).toBe('María Quispe');
    expect(gateway.contacts.get(existing.id)?.customAttributes).toMatchObject({ vip: true, lead_reference: 'SIS-7K3M2' });
    expect(gateway.contactLabels.get('55')).toEqual(['cliente-antiguo', 'marca-sis', 'promo-con-ia', 'campania-nov-2026', 'sede-tacna', 'origen-landing']);
    expect((await contactLinks.findByLeadId(LEAD_ID))?.crmContactId).toBe('55');
  });

  it('con un 500 registra RETRYABLE_FAILURE, deja el trabajo PENDING y relanza', async () => {
    const { gateway, syncJobs, attempts, publisher, useCase } = setup();
    gateway.failWith('createContact', 500);

    await expect(useCase.execute({ ...baseInput, payload: leadCreatedPayload() })).rejects.toBeInstanceOf(IntegrationError);

    expect(attempts.attempts).toHaveLength(1);
    expect(attempts.attempts[0]).toMatchObject({ status: 'RETRYABLE_FAILURE', httpStatus: 500 });
    expect(syncJobs.jobs.get(LEAD_ID)).toMatchObject({ status: 'PENDING', attempts: 1 });
    expect(syncJobs.jobs.get(LEAD_ID)?.lastError).toContain('500');
    expect(publisher.published).toHaveLength(0);
  });

  it('con un 422 registra PERMANENT_FAILURE, marca FAILED y publica crm.sync.failed.v1', async () => {
    const { gateway, syncJobs, attempts, publisher, processedEvents, useCase } = setup();
    gateway.failWith('createContact', 422);

    const result = await useCase.execute({ ...baseInput, payload: leadCreatedPayload() });

    expect(result.status).toBe('failed');
    expect(attempts.attempts[0]).toMatchObject({ status: 'PERMANENT_FAILURE', httpStatus: 422 });
    expect(syncJobs.jobs.get(LEAD_ID)?.status).toBe('FAILED');
    expect(await processedEvents.has(EVENT_ID)).toBe(false);
    const failed = publisher.byName(EventNames.CrmSyncFailed);
    expect(failed).toHaveLength(1);
    expect(failed[0]!.payload).toMatchObject({ leadId: LEAD_ID, reference: 'SIS-7K3M2', attempts: 1 });
  });

  it('al agotar los intentos con un fallo reintentable marca DEAD y publica crm.sync.failed.v1', async () => {
    const { gateway, syncJobs, publisher, useCase } = setup();
    gateway.failWith('createContact', 503);

    const result = await useCase.execute({ ...baseInput, attempt: 5, maxAttempts: 5, payload: leadCreatedPayload() });

    expect(result.status).toBe('dead');
    expect(syncJobs.jobs.get(LEAD_ID)).toMatchObject({ status: 'DEAD', attempts: 5 });
    expect(publisher.byName(EventNames.CrmSyncFailed)[0]!.payload).toMatchObject({ attempts: 5 });
  });

  it('trata Chatwoot sin configurar como fallo reintentable', async () => {
    const { gateway, attempts, useCase } = setup();
    gateway.configured = false;
    gateway.findContactByPhone = async () => {
      throw IntegrationError.retryable('Chatwoot no está configurado', { code: 'CHATWOOT_NOT_CONFIGURED' });
    };

    await expect(useCase.execute({ ...baseInput, payload: leadCreatedPayload() })).rejects.toMatchObject({ code: 'CHATWOOT_NOT_CONFIGURED' });
    expect(attempts.attempts[0]?.status).toBe('RETRYABLE_FAILURE');
  });

  it('el mismo eventId dos veces: la segunda ejecución es no-op', async () => {
    const { gateway, publisher, useCase } = setup();
    const payload = leadCreatedPayload();

    await useCase.execute({ ...baseInput, payload });
    const callsAfterFirst = gateway.calls.length;
    const second = await useCase.execute({ ...baseInput, payload });

    expect(second).toEqual({ status: 'skipped', reason: 'already_processed' });
    expect(gateway.calls).toHaveLength(callsAfterFirst);
    expect(publisher.byName(EventNames.CrmContactSynced)).toHaveLength(1);
  });

  it('con force reprocesa aunque el evento ya esté marcado como procesado', async () => {
    const { gateway, useCase } = setup();
    const payload = leadCreatedPayload();

    await useCase.execute({ ...baseInput, payload });
    const result = await useCase.execute({ ...baseInput, payload, attempt: 2, force: true });

    expect(result.status).toBe('synced');
    expect(gateway.calledMethods().filter((method) => method === 'updateContact')).toHaveLength(1);
  });

  describe('sede y especialidades (A4)', () => {
    it('crea el contacto en la bandeja de su sede con la etiqueta sede-<campus>', async () => {
      const { gateway, contactLinks, useCase } = setup();

      await useCase.execute({ ...baseInput, payload: leadCreatedPayload({ campus: 'arequipa' }) });

      expect(gateway.callsTo('createContact')[0]!.args[0]).toMatchObject({ inboxId: 4, customAttributes: { campus: 'arequipa' } });
      expect((await contactLinks.findByLeadId(LEAD_ID))!.labels).toContain('sede-arequipa');
    });

    it('usa la bandeja por defecto cuando la sede no tiene una propia', async () => {
      const { gateway, useCase } = setup();

      await useCase.execute({ ...baseInput, payload: leadCreatedPayload({ campus: 'tacna' }) });

      expect(gateway.callsTo('createContact')[0]!.args[0]).toMatchObject({ inboxId: 3 });
    });

    it('guarda las especialidades elegidas en el atributo specialties (null si no eligió)', async () => {
      const { gateway, useCase } = setup();
      const payload = leadCreatedPayload({
        specialties: [
          { id: 'ciberseguridad', name: 'Ciberseguridad' },
          { id: 'ciencia-de-datos', name: 'Ciencia de datos' },
        ],
      });

      await useCase.execute({ ...baseInput, payload });

      expect(gateway.callsTo('createContact')[0]!.args[0]).toMatchObject({
        customAttributes: { specialties: 'Ciberseguridad, Ciencia de datos' },
      });

      const other = setup();
      await other.useCase.execute({ ...baseInput, payload: leadCreatedPayload() });
      expect(other.gateway.callsTo('createContact')[0]!.args[0]).toMatchObject({ customAttributes: { specialties: null } });
    });
  });

  describe('seguimiento con plantilla (A6)', () => {
    it('programa el seguimiento tras AFTER_HOURS desde la sincronización, una sola vez', async () => {
      const { followups, clock, useCase } = setup();
      const payload = leadCreatedPayload();

      await useCase.execute({ ...baseInput, payload });
      await useCase.execute({ ...baseInput, payload, attempt: 2, force: true });

      expect(followups.rows.size).toBe(1);
      expect(followups.rows.get(LEAD_ID)).toMatchObject({
        status: 'PENDING',
        dueAt: new Date(clock.now().getTime() + 24 * 60 * 60 * 1000),
      });
    });
  });

  it('no vuelve a sincronizar un lead anonimizado (C9)', async () => {
    const { gateway, syncJobs, useCase } = setup();
    const payload = leadCreatedPayload();
    await syncJobs.upsertPending({ leadId: LEAD_ID, eventId: EVENT_ID, reference: payload.reference, payload, attempt: 1 });
    syncJobs.jobs.set(LEAD_ID, { ...syncJobs.jobs.get(LEAD_ID)!, payload: null, anonymizedAt: new Date() });

    const result = await useCase.execute({ ...baseInput, eventId: 'otro-evento', payload });

    expect(result).toEqual({ status: 'skipped', reason: 'anonymized' });
    expect(gateway.calls).toHaveLength(0);
  });
});
