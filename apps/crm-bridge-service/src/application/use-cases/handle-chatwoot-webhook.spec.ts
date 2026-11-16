import { EventNames } from '@capsur/api-contracts';
import { FakeChatwootGateway } from '../../../test/fakes/fake-chatwoot-gateway';
import {
  InMemoryAttemptRepository,
  InMemoryContactLinkRepository,
  InMemoryFollowupRepository,
  InMemorySyncJobRepository,
  InMemoryWebhookEventRepository,
} from '../../../test/fakes/in-memory-repositories';
import { EVENT_ID, FakeEventPublisher, FixedClock, LEAD_ID, leadCreatedPayload } from '../../../test/fakes/support';
import { AssignmentPolicy, type AssignmentStrategy } from '../../domain/assignment-policy';
import { AgentDirectory } from '../services/agent-directory';
import { type AutoReplySettings, HandleChatwootWebhook } from './handle-chatwoot-webhook';

interface SetupOptions {
  strategy?: AssignmentStrategy;
  autoReply?: AutoReplySettings;
}

function setup(policy = new AssignmentPolicy([], 9), options: SetupOptions = {}) {
  const gateway = new FakeChatwootGateway();
  const contactLinks = new InMemoryContactLinkRepository();
  const syncJobs = new InMemorySyncJobRepository();
  const webhookEvents = new InMemoryWebhookEventRepository();
  const attempts = new InMemoryAttemptRepository();
  const followups = new InMemoryFollowupRepository();
  const publisher = new FakeEventPublisher();
  const clock = new FixedClock();
  const agentDirectory = new AgentDirectory(gateway, clock);
  const useCase = new HandleChatwootWebhook({
    gateway,
    contactLinks,
    syncJobs,
    webhookEvents,
    attempts,
    publisher,
    clock,
    assignmentPolicy: policy,
    assignmentStrategy: options.strategy ?? 'round_robin',
    agentDirectory,
    autoReply: options.autoReply ?? null,
    followups,
  });
  return { gateway, contactLinks, syncJobs, webhookEvents, attempts, followups, publisher, clock, agentDirectory, useCase };
}

async function seedLead(deps: ReturnType<typeof setup>, crmContactId = '501') {
  await deps.syncJobs.upsertPending({ leadId: LEAD_ID, eventId: EVENT_ID, reference: 'SIS-7K3M2', payload: leadCreatedPayload(), attempt: 1 });
  await deps.syncJobs.update(LEAD_ID, { status: 'SUCCEEDED' });
  return deps.contactLinks.upsert({
    leadId: LEAD_ID,
    reference: 'SIS-7K3M2',
    crmAccountId: '7',
    crmContactId,
    labels: ['marca-sis', 'promo-con-ia', 'origen-landing'],
    syncedAt: new Date('2026-11-13T14:59:40.000Z'),
  });
}

function incomingMessage(overrides: Record<string, unknown> = {}) {
  return {
    event: 'message_created',
    id: 9001,
    content: 'Hola, soy María. Código de solicitud: SIS-7K3M2',
    message_type: 'incoming',
    sender: { id: 777, name: 'María', type: 'contact' },
    inbox: { id: 3 },
    conversation: { id: 42, inbox_id: 3, status: 'open' },
    account: { id: 7 },
    ...overrides,
  };
}

describe('HandleChatwootWebhook', () => {
  it('enlaza por código de referencia un message_created entrante y publica crm.conversation.linked.v1', async () => {
    const deps = setup();
    await seedLead(deps, '501');

    const result = await deps.useCase.execute(incomingMessage());

    expect(result).toMatchObject({ outcome: 'linked', leadId: LEAD_ID, conversationId: '42' });
    const link = await deps.contactLinks.findByLeadId(LEAD_ID);
    expect(link).toMatchObject({ crmConversationId: '42', crmInboxId: '3', assignedTo: 'team:9' });
    expect(link!.conversationLinkedAt).toEqual(deps.clock.now());
    expect(deps.gateway.conversationLabels.get('42')).toEqual(['marca-sis', 'promo-con-ia', 'origen-landing']);
    expect(deps.gateway.assignments.get('42')).toEqual({ teamId: 9 });

    const linked = deps.publisher.byName(EventNames.CrmConversationLinked);
    expect(linked).toHaveLength(1);
    expect(linked[0]!.payload).toMatchObject({
      leadId: LEAD_ID,
      reference: 'SIS-7K3M2',
      crmContactId: '501',
      crmConversationId: '42',
      inboxId: '3',
      assignedTo: 'team:9',
    });
    expect(deps.webhookEvents.events.get('message_created:42:9001')?.outcome).toBe('linked');
  });

  it('enlaza por contacto cuando el sender coincide con crm_contact_links', async () => {
    const deps = setup(new AssignmentPolicy([]));
    await seedLead(deps, '777');

    const result = await deps.useCase.execute(incomingMessage({ content: 'Hola, quiero información' }));

    expect(result.outcome).toBe('linked');
    expect((await deps.contactLinks.findByLeadId(LEAD_ID))?.assignedTo).toBeNull();
    expect(deps.gateway.calledMethods()).not.toContain('assignConversation');
  });

  it('aplica reglas de asignación con round-robin entre agentes', async () => {
    const policy = AssignmentPolicy.fromJson(JSON.stringify([{ match: { brand: 'sis' }, agentIds: [11, 12] }]));
    const deps = setup(policy);
    await seedLead(deps, '777');

    const result = await deps.useCase.execute(incomingMessage({ content: 'Hola' }));

    expect(result.outcome).toBe('linked');
    expect(deps.gateway.assignments.get('42')).toEqual({ assigneeId: 11 });
    expect((await deps.contactLinks.findByLeadId(LEAD_ID))?.assignedTo).toBe('agent:11');
  });

  it('ignora un evento duplicado (misma dedupeKey)', async () => {
    const deps = setup();
    await seedLead(deps, '501');

    await deps.useCase.execute(incomingMessage());
    const second = await deps.useCase.execute(incomingMessage());

    expect(second).toEqual({ outcome: 'ignored', reason: 'duplicate' });
    expect(deps.publisher.byName(EventNames.CrmConversationLinked)).toHaveLength(1);
  });

  it('ignora mensajes salientes', async () => {
    const deps = setup();
    await seedLead(deps, '501');

    const result = await deps.useCase.execute(incomingMessage({ message_type: 'outgoing', sender: { id: 1, type: 'user' } }));

    expect(result).toMatchObject({ outcome: 'ignored', reason: 'not_incoming_message' });
  });

  it('devuelve unmatched cuando no hay lead asociado', async () => {
    const deps = setup();

    const result = await deps.useCase.execute(incomingMessage({ content: 'Hola, ¿tienen carreras técnicas?', sender: { id: 999, type: 'contact' } }));

    expect(result).toMatchObject({ outcome: 'unmatched', conversationId: '42' });
    expect(deps.webhookEvents.events.get('message_created:42:9001')?.outcome).toBe('unmatched');
    expect(deps.publisher.published).toHaveLength(0);
  });

  it('no vuelve a enlazar una conversación ya enlazada', async () => {
    const deps = setup();
    await seedLead(deps, '501');
    await deps.useCase.execute(incomingMessage());

    const result = await deps.useCase.execute(incomingMessage({ id: 9002, content: 'Otra pregunta' , sender: { id: 501, type: 'contact' } }));

    expect(result).toMatchObject({ outcome: 'ignored', reason: 'already_linked' });
    expect(deps.publisher.byName(EventNames.CrmConversationLinked)).toHaveLength(1);
  });

  it('enlaza desde conversation_created usando el primer mensaje entrante', async () => {
    const deps = setup();
    await seedLead(deps, '501');

    const result = await deps.useCase.execute({
      event: 'conversation_created',
      id: 43,
      inbox_id: 3,
      status: 'open',
      meta: { sender: { id: 888, type: 'contact' } },
      messages: [{ id: 1, content: 'código de solicitud: sis-7k3m2', message_type: 0 }],
    });

    expect(result).toMatchObject({ outcome: 'linked', conversationId: '43' });
  });

  it('registra el error y responde error si Chatwoot falla al etiquetar pero mantiene el vínculo', async () => {
    const deps = setup(new AssignmentPolicy([]));
    await seedLead(deps, '501');
    deps.gateway.failWith('setConversationLabels', 500);

    const result = await deps.useCase.execute(incomingMessage());

    expect(result.outcome).toBe('linked');
    expect(deps.attempts.attempts.find((attempt) => attempt.operation === 'link_conversation')?.status).toBe('RETRYABLE_FAILURE');
    expect((await deps.contactLinks.findByLeadId(LEAD_ID))?.crmConversationId).toBe('42');
  });

  it('ignora cuerpos no reconocidos y eventos no soportados', async () => {
    const deps = setup();

    expect(await deps.useCase.execute({ foo: 'bar' })).toMatchObject({ outcome: 'ignored', reason: 'unrecognized_body' });
    expect(await deps.useCase.execute({ event: 'webwidget_triggered', id: 1 })).toMatchObject({ outcome: 'ignored', reason: 'unsupported_event' });
    expect(deps.webhookEvents.events.size).toBe(0);
  });

  describe('asignación least_loaded (A9)', () => {
    const rules = JSON.stringify([{ match: { brand: 'sis' }, agentIds: [11, 12, 13] }]);

    function seedAgents(deps: ReturnType<typeof setup>) {
      deps.gateway.agents = [
        { id: 11, name: 'Ana', availabilityStatus: 'online' },
        { id: 12, name: 'Beto', availabilityStatus: 'online' },
        { id: 13, name: 'Caro', availabilityStatus: 'offline' },
      ];
      deps.gateway.openConversations = new Map([
        [11, 7],
        [12, 2],
        [13, 0],
      ]);
    }

    it('asigna al agente disponible con menos conversaciones abiertas e informa su nombre', async () => {
      const deps = setup(AssignmentPolicy.fromJson(rules), { strategy: 'least_loaded' });
      seedAgents(deps);
      await seedLead(deps, '777');

      const result = await deps.useCase.execute(incomingMessage({ content: 'Hola' }));

      expect(result.outcome).toBe('linked');
      // 13 tiene 0 conversaciones pero está offline: gana 12 (2) frente a 11 (7).
      expect(deps.gateway.assignments.get('42')).toEqual({ assigneeId: 12 });
      expect(await deps.contactLinks.findByLeadId(LEAD_ID)).toMatchObject({ assignedTo: 'agent:12', assignedToName: 'Beto' });
      expect(deps.publisher.byName(EventNames.CrmConversationLinked)[0]!.payload).toMatchObject({
        assignedTo: 'agent:12',
        assignedToName: 'Beto',
      });
    });

    it('usa la caché de 60 s y suma la asignación a la carga cacheada', async () => {
      const deps = setup(AssignmentPolicy.fromJson(rules), { strategy: 'least_loaded' });
      seedAgents(deps);
      deps.gateway.openConversations = new Map([
        [11, 2],
        [12, 2],
      ]);
      const loadsBefore = await deps.agentDirectory.loads();
      deps.agentDirectory.recordAssignment(11);
      const loadsAfter = await deps.agentDirectory.loads();

      expect(loadsBefore.get(11)?.openConversations).toBe(2);
      expect(loadsAfter.get(11)?.openConversations).toBe(3);
      expect(deps.gateway.callsTo('countOpenConversationsByAssignee')).toHaveLength(1);

      deps.clock.advance(60_001);
      await deps.agentDirectory.loads();
      expect(deps.gateway.callsTo('countOpenConversationsByAssignee')).toHaveLength(2);
    });

    it('si Chatwoot falla al consultar cargas, degrada a round_robin', async () => {
      const deps = setup(AssignmentPolicy.fromJson(rules), { strategy: 'least_loaded' });
      deps.gateway.failWith('listAgents', 503, 2);
      await seedLead(deps, '777');

      const result = await deps.useCase.execute(incomingMessage({ content: 'Hola' }));

      expect(result.outcome).toBe('linked');
      expect(deps.gateway.assignments.get('42')).toEqual({ assigneeId: 11 });
      expect((await deps.contactLinks.findByLeadId(LEAD_ID))?.assignedToName).toBeNull();
    });

    it('con round_robin no consulta cargas pero sí el nombre del agente', async () => {
      const deps = setup(AssignmentPolicy.fromJson(rules));
      seedAgents(deps);
      await seedLead(deps, '777');

      await deps.useCase.execute(incomingMessage({ content: 'Hola' }));

      expect(deps.gateway.calledMethods()).not.toContain('countOpenConversationsByAssignee');
      expect(await deps.contactLinks.findByLeadId(LEAD_ID)).toMatchObject({ assignedTo: 'agent:11', assignedToName: 'Ana' });
    });
  });

  describe('respuesta automática (A8)', () => {
    const autoReply: AutoReplySettings = { enabled: true, catalogUrls: { 'con-ia': 'https://sis.edu.pe/catalogos/con-ia.pdf' } };

    it('envía un único mensaje saliente con nombre, promoción, catálogo y asesor', async () => {
      const policy = AssignmentPolicy.fromJson(JSON.stringify([{ match: { brand: 'sis' }, agentIds: [11] }]));
      const deps = setup(policy, { autoReply });
      deps.gateway.agents = [{ id: 11, name: 'Ana', availabilityStatus: 'online' }];
      await seedLead(deps, '501');

      await deps.useCase.execute(incomingMessage());

      expect(deps.gateway.messages).toHaveLength(1);
      const [message] = deps.gateway.messages;
      expect(message!.conversationId).toBe('42');
      expect(message!.content).toContain('¡Hola, María!');
      expect(message!.content).toContain('Computación e Informática con IA');
      expect(message!.content).toContain('SIS-7K3M2');
      expect(message!.content).toContain('https://sis.edu.pe/catalogos/con-ia.pdf');
      expect(message!.content).toContain('Ana');
      expect(deps.attempts.attempts.find((attempt) => attempt.operation === 'auto_reply')?.status).toBe('SUCCESS');
    });

    it('nunca se envía dos veces aunque se vuelva a vincular (marca atómica)', async () => {
      const deps = setup(new AssignmentPolicy([]), { autoReply });
      await seedLead(deps, '501');
      await deps.useCase.execute(incomingMessage());

      // Simula un segundo vínculo (p. ej. réplica en paralelo): la marca ya está puesta.
      const link = deps.contactLinks.links.get(LEAD_ID)!;
      deps.contactLinks.links.set(LEAD_ID, { ...link, crmConversationId: null });
      await deps.useCase.execute(incomingMessage({ id: 9100 }));

      expect(deps.gateway.messages).toHaveLength(1);
    });

    it('sin catálogo ni asesor, el mensaje no los menciona', async () => {
      const deps = setup(new AssignmentPolicy([]), { autoReply: { enabled: true, catalogUrls: {} } });
      await seedLead(deps, '501');

      await deps.useCase.execute(incomingMessage());

      expect(deps.gateway.messages[0]!.content).not.toContain('catálogo');
      expect(deps.gateway.messages[0]!.content).toContain('Un asesor(a) te atenderá');
    });

    it('desactivada no envía nada', async () => {
      const deps = setup(new AssignmentPolicy([]), { autoReply: { enabled: false, catalogUrls: {} } });
      await seedLead(deps, '501');

      await deps.useCase.execute(incomingMessage());

      expect(deps.gateway.messages).toHaveLength(0);
    });

    it('un fallo de Chatwoot al enviar no impide el vínculo', async () => {
      const deps = setup(new AssignmentPolicy([]), { autoReply });
      deps.gateway.failWith('sendOutgoingMessage', 500);
      await seedLead(deps, '501');

      const result = await deps.useCase.execute(incomingMessage());

      expect(result.outcome).toBe('linked');
      expect(deps.attempts.attempts.find((attempt) => attempt.operation === 'auto_reply')?.status).toBe('RETRYABLE_FAILURE');
    });
  });

  it('no vincula la conversación abierta por la plantilla de seguimiento hasta que el contacto responde (A6)', async () => {
    const deps = setup();
    await seedLead(deps, '501');
    await deps.followups.schedule(LEAD_ID, new Date());
    await deps.followups.complete(LEAD_ID, { status: 'SENT', attempts: 1, crmConversationId: '77' });

    const created = await deps.useCase.execute({ event: 'conversation_created', id: 77, inbox_id: 3, meta: { sender: { id: 501, type: 'contact' } }, messages: [] });
    expect(created).toMatchObject({ outcome: 'ignored', reason: 'awaiting_contact_reply' });

    const reply = await deps.useCase.execute(incomingMessage({ conversation: { id: 77, inbox_id: 3 }, sender: { id: 501, type: 'contact' }, content: 'Sí, quiero el catálogo' }));
    expect(reply).toMatchObject({ outcome: 'linked', conversationId: '77' });
  });
});
