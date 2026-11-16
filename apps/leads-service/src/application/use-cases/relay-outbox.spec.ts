import { EventNames } from '@capsur/api-contracts';
import {
  FakeEventPublisher,
  FixedClock,
  InMemoryLeadRepository,
  InMemoryOutboxRepository,
  InMemoryStore,
  SilentLogger,
  leadFixture,
} from '../../../test/support/fakes';
import { RelayOutbox, nextOutboxDelay } from './relay-outbox';

const NOW = new Date('2026-11-13T15:00:00.000Z');

function eventId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

function setup(options: { batchSize?: number } = {}) {
  const store = new InMemoryStore();
  const publisher = new FakeEventPublisher();
  const clock = new FixedClock(NOW);
  const relay = new RelayOutbox(
    new InMemoryOutboxRepository(store),
    new InMemoryLeadRepository(store),
    publisher,
    clock,
    new SilentLogger(),
    options,
  );
  return { store, publisher, clock, relay };
}

function seedLeadEvent(store: InMemoryStore, n: number): string {
  const leadId = `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  store.seedLead(leadFixture({ id: leadId, reference: `SIS-AAAA${String.fromCharCode(64 + n)}` }));
  store.addOutbox({
    id: eventId(n),
    name: EventNames.LeadCreated,
    version: 1,
    correlationId: leadId,
    payload: { leadId },
    createdAt: new Date(NOW.getTime() - 1000 + n),
  });
  return leadId;
}

describe('RelayOutbox', () => {
  it('publica en lote, marca PUBLISHED y pasa los leads a CRM_SYNCING', async () => {
    const { store, publisher, relay } = setup();
    const leadA = seedLeadEvent(store, 1);
    const leadB = seedLeadEvent(store, 2);

    const summary = await relay.execute();

    expect(summary).toEqual({ claimed: 2, published: 2, retried: 0, failed: 0, saturated: false });
    expect(publisher.published.map((envelope) => envelope.id)).toEqual([eventId(1), eventId(2)]);
    expect(publisher.published[0]).toMatchObject({ name: EventNames.LeadCreated, producer: 'leads-service', version: 1 });
    expect(store.outbox.get(eventId(1))).toMatchObject({ status: 'PUBLISHED', publishedAt: NOW });
    expect(store.leads.get(leadA)?.status).toBe('CRM_SYNCING');
    expect(store.leads.get(leadB)?.status).toBe('CRM_SYNCING');
  });

  it('un nack parcial solo reprograma ese evento con backoff exponencial', async () => {
    const { store, publisher, relay } = setup();
    seedLeadEvent(store, 1);
    const failingLead = seedLeadEvent(store, 2);
    publisher.failingIds.add(eventId(2));

    const summary = await relay.execute();

    expect(summary).toMatchObject({ published: 1, retried: 1 });
    expect(store.outbox.get(eventId(2))).toMatchObject({
      status: 'PENDING',
      attempts: 1,
      nextAttemptAt: new Date(NOW.getTime() + 2000),
      lastError: 'El broker rechazó la publicación',
    });
    expect(store.leads.get(failingLead)?.status).toBe('REGISTERED');
  });

  it('marca FAILED tras agotar los intentos', async () => {
    const { store, publisher, relay } = setup();
    seedLeadEvent(store, 1);
    store.outbox.set(eventId(1), { ...store.outbox.get(eventId(1))!, attempts: 9 });
    publisher.failWith = new Error('BrokerUnavailableError');

    const summary = await relay.execute();

    expect(summary.failed).toBe(1);
    expect(store.outbox.get(eventId(1))).toMatchObject({ status: 'FAILED', attempts: 10 });
  });

  it('indica saturated cuando llena el lote', async () => {
    const { store, relay } = setup({ batchSize: 2 });
    seedLeadEvent(store, 1);
    seedLeadEvent(store, 2);
    seedLeadEvent(store, 3);

    expect((await relay.execute()).saturated).toBe(true);
    expect((await relay.execute()).saturated).toBe(false);
  });

  it('sin eventos no publica nada', async () => {
    const { publisher, relay } = setup();
    expect(await relay.execute()).toEqual({ claimed: 0, published: 0, retried: 0, failed: 0, saturated: false });
    expect(publisher.published).toHaveLength(0);
  });
});

describe('nextOutboxDelay (B10)', () => {
  const base = 2000;

  it('casi inmediato con el lote lleno', () => {
    expect(nextOutboxDelay(base, { claimed: 50, saturated: true }, base)).toBe(25);
  });

  it('intervalo base si hubo trabajo o error', () => {
    expect(nextOutboxDelay(8000, { claimed: 3, saturated: false }, base)).toBe(base);
    expect(nextOutboxDelay(8000, null, base)).toBe(base);
  });

  it('se duplica en reposo hasta base × 5', () => {
    let delay = base;
    const sequence: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      delay = nextOutboxDelay(delay, { claimed: 0, saturated: false }, base);
      sequence.push(delay);
    }
    expect(sequence).toEqual([4000, 8000, 10_000, 10_000]);
  });
});
