import { EventNames, LeadAnonymizedPayloadSchema, LeadFeedbackPayloadSchema } from '@capsur/api-contracts';
import {
  FakeOutboxSignal,
  FixedClock,
  InMemoryLeadRepository,
  InMemoryStore,
  InMemoryTrackingRepository,
  SilentLogger,
  leadFixture,
} from '../../../test/support/fakes';
import { FeedbackAlreadySubmittedError, LeadNotFoundError } from '../../domain/errors';
import { LeadTokenSigner } from '../support/lead-token';
import { AnonymizeExpiredLeads, AnonymizeLead } from './anonymize-lead';
import { GetLeadStatus } from './get-lead-status';
import { RecordTrackingEvent } from './record-tracking-event';
import { SubmitLeadFeedback } from './submit-lead-feedback';

const NOW = new Date('2026-11-14T10:00:00.000Z');
const tokens = new LeadTokenSigner('test-only-lead-token-secret-0123');

describe('LeadTokenSigner (C18)', () => {
  it('firma HMAC en base64url y verifica en tiempo constante', () => {
    const token = tokens.sign('5c0f2d8e-1a2b-4c3d-9e8f-0a1b2c3d4e5f');
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokens.verify('5c0f2d8e-1a2b-4c3d-9e8f-0a1b2c3d4e5f', token)).toBe(true);
    expect(tokens.verify('6c0f2d8e-1a2b-4c3d-9e8f-0a1b2c3d4e5f', token)).toBe(false);
    expect(tokens.verify('5c0f2d8e-1a2b-4c3d-9e8f-0a1b2c3d4e5f', undefined)).toBe(false);
    expect(tokens.verify('5c0f2d8e-1a2b-4c3d-9e8f-0a1b2c3d4e5f', 'corto')).toBe(false);
    expect(() => new LeadTokenSigner('corto')).toThrow();
  });
});

describe('GetLeadStatus', () => {
  it('devuelve el estado con el nombre del asesor si el token es válido', async () => {
    const store = new InMemoryStore();
    const lead = leadFixture({ status: 'CRM_SYNCED', crmConversationId: 'c1', crmAdvisorName: 'Lucía', crmSyncedAt: NOW });
    store.seedLead(lead);
    const useCase = new GetLeadStatus(new InMemoryLeadRepository(store), tokens);

    await expect(useCase.execute(lead.id, tokens.sign(lead.id))).resolves.toEqual({
      leadId: lead.id,
      reference: lead.reference,
      status: 'crm_synced',
      crm: { syncedAt: NOW.toISOString(), conversationLinked: true, advisorName: 'Lucía' },
      updatedAt: lead.updatedAt.toISOString(),
    });
  });

  it('sin token, token ajeno o lead inexistente → mismo LeadNotFoundError', async () => {
    const store = new InMemoryStore();
    const lead = leadFixture();
    store.seedLead(lead);
    const useCase = new GetLeadStatus(new InMemoryLeadRepository(store), tokens);
    const missing = '7c0f2d8e-1a2b-4c3d-9e8f-0a1b2c3d4e5f';

    await expect(useCase.execute(lead.id, undefined)).rejects.toBeInstanceOf(LeadNotFoundError);
    await expect(useCase.execute(lead.id, tokens.sign(missing))).rejects.toBeInstanceOf(LeadNotFoundError);
    await expect(useCase.execute(missing, tokens.sign(missing))).rejects.toBeInstanceOf(LeadNotFoundError);
  });
});

describe('SubmitLeadFeedback (A21)', () => {
  function setup() {
    const store = new InMemoryStore();
    const signal = new FakeOutboxSignal();
    const useCase = new SubmitLeadFeedback({
      leads: new InMemoryLeadRepository(store),
      tokens,
      outboxSignal: signal,
      clock: new FixedClock(NOW),
      logger: new SilentLogger(),
      idFactory: () => '00000000-0000-4000-8000-00000000f00d',
    });
    const lead = leadFixture();
    store.seedLead(lead);
    return { store, signal, useCase, lead };
  }

  it('guarda la respuesta y encola lead.feedback.v1', async () => {
    const { store, signal, useCase, lead } = setup();

    await useCase.execute(lead.id, tokens.sign(lead.id), { source: 'tiktok', detail: 'Un video' });

    expect(store.leads.get(lead.id)?.feedback).toEqual({ source: 'tiktok', detail: 'Un video', receivedAt: NOW });
    const [event] = store.outboxByName(EventNames.LeadFeedbackReceived);
    expect(LeadFeedbackPayloadSchema.parse(event?.payload)).toEqual({
      leadId: lead.id,
      reference: lead.reference,
      source: 'tiktok',
      detail: 'Un video',
      receivedAt: NOW.toISOString(),
    });
    expect(signal.notifications).toBe(1);
  });

  it('una sola vez por lead (409) y exige token (404)', async () => {
    const { useCase, lead } = setup();
    await useCase.execute(lead.id, tokens.sign(lead.id), { source: 'google' });

    await expect(useCase.execute(lead.id, tokens.sign(lead.id), { source: 'otro' })).rejects.toBeInstanceOf(
      FeedbackAlreadySubmittedError,
    );
    await expect(useCase.execute(lead.id, 'token-falso', { source: 'otro' })).rejects.toBeInstanceOf(LeadNotFoundError);
  });
});

describe('AnonymizeLead y retención (C9)', () => {
  function setup() {
    const store = new InMemoryStore();
    let id = 0;
    const anonymizeLead = new AnonymizeLead({
      leads: new InMemoryLeadRepository(store),
      outboxSignal: new FakeOutboxSignal(),
      clock: new FixedClock(NOW),
      logger: new SilentLogger(),
      idFactory: () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`,
    });
    return { store, anonymizeLead };
  }

  it('anonimiza, limpia consentimiento/atribución y publica lead.anonymized.v1 una sola vez', async () => {
    const { store, anonymizeLead } = setup();
    const lead = leadFixture();
    store.seedLead(lead);
    store.consents.push({
      leadId: lead.id,
      contactAccepted: true,
      marketingAccepted: true,
      privacyVersion: '2026-11',
      acceptedAt: NOW,
      ipHash: 'x',
      userAgent: 'ua',
    });
    store.attributions.set(lead.id, { utmSource: 'meta' });

    await expect(anonymizeLead.execute(lead.id, { reason: 'admin', deleteCrmContact: true })).resolves.toEqual({
      leadId: lead.id,
      anonymized: true,
    });
    await expect(anonymizeLead.execute(lead.id, { reason: 'admin', deleteCrmContact: true })).resolves.toEqual({
      leadId: lead.id,
      anonymized: false,
    });

    expect(store.leads.get(lead.id)).toMatchObject({ phoneE164: '', email: '', phoneHash: null, anonymizedAt: NOW });
    expect(store.consents[0]).toMatchObject({ ipHash: null, userAgent: null, marketingAccepted: true });
    expect(store.attributions.has(lead.id)).toBe(false);
    const events = store.outboxByName(EventNames.LeadAnonymized);
    expect(events).toHaveLength(1);
    expect(LeadAnonymizedPayloadSchema.parse(events[0]?.payload)).toMatchObject({ reason: 'admin', deleteCrmContact: true });
  });

  it('la retención anonimiza solo los leads con más de N días', async () => {
    const { store, anonymizeLead } = setup();
    const old = leadFixture({ id: '10000000-0000-4000-8000-000000000001', createdAt: new Date('2024-11-01T00:00:00.000Z') });
    const recent = leadFixture({ id: '10000000-0000-4000-8000-000000000002', reference: 'SIS-7K3M3' });
    store.seedLead(old);
    store.seedLead(recent);
    const job = new AnonymizeExpiredLeads({
      leads: new InMemoryLeadRepository(store),
      anonymizeLead,
      clock: new FixedClock(NOW),
      logger: new SilentLogger(),
      retentionDays: 730,
      batchSize: 1,
    });

    await expect(job.execute()).resolves.toEqual({ anonymized: 1, failed: 0 });
    expect(store.leads.get(old.id)?.anonymizedAt).toEqual(NOW);
    expect(store.leads.get(recent.id)?.anonymizedAt).toBeNull();
    const [event] = store.outboxByName(EventNames.LeadAnonymized);
    expect(LeadAnonymizedPayloadSchema.parse(event?.payload).reason).toBe('retention');
  });
});

describe('RecordTrackingEvent (A18)', () => {
  it('guarda especialidad y experimento', async () => {
    const store = new InMemoryStore();
    await new RecordTrackingEvent(new InMemoryTrackingRepository(store), new FixedClock(NOW)).execute({
      brand: 'sis',
      event: 'experiment_exposed',
      sessionId: 'sess-12345678',
      specialtyId: 'ciencia-datos-ia',
      experiment: { id: 'hero-copy', variant: 'b' },
    });
    expect(store.tracking[0]).toMatchObject({
      event: 'experiment_exposed',
      specialtyId: 'ciencia-datos-ia',
      experiment: { id: 'hero-copy', variant: 'b' },
      occurredAt: NOW,
    });
  });
});
