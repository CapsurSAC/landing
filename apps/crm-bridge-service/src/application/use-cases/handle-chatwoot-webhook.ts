import { type CrmConversationLinkedPayload, EventNames, type LeadCreatedPayload } from '@capsur/api-contracts';
import {
  type AgentLoad,
  type AssignmentContext,
  type AssignmentPolicy,
  type AssignmentStrategy,
  formatAssignee,
} from '../../domain/assignment-policy';
import { buildAutoReplyMessage } from '../../domain/auto-reply';
import { normalizeChatwootWebhook, type NormalizedWebhookEvent } from '../../domain/chatwoot-webhook';
import { type ContactLink } from '../../domain/contact-link';
import { IntegrationError, type IntegrationOperation } from '../../domain/integration-error';
import { firstName } from '../../domain/lead-labels';
import { extractReference } from '../../domain/reference-extractor';
import { crmEnvelope } from '../events/envelope';
import { type ChatwootGateway } from '../ports/chatwoot-gateway';
import { type Clock } from '../ports/clock';
import { type EventPublisher } from '../ports/event-publisher';
import { type LoggerPort, noopLogger } from '../ports/logger';
import {
  type AttemptRepository,
  type ContactLinkRepository,
  type FollowupRepository,
  type SyncJobRepository,
  type WebhookEventRepository,
  type WebhookOutcome,
} from '../ports/repositories';
import { type AgentDirectory } from '../services/agent-directory';

export interface WebhookHandlingResult {
  outcome: WebhookOutcome;
  reason?: string;
  leadId?: string;
  conversationId?: string;
}

export interface AutoReplySettings {
  enabled: boolean;
  /** `CATALOG_URLS_JSON`: promotionId → URL del catálogo PDF. */
  catalogUrls: Readonly<Record<string, string>>;
}

export interface HandleWebhookDependencies {
  gateway: ChatwootGateway;
  contactLinks: ContactLinkRepository;
  syncJobs: SyncJobRepository;
  webhookEvents: WebhookEventRepository;
  attempts: AttemptRepository;
  publisher: EventPublisher;
  clock: Clock;
  assignmentPolicy: AssignmentPolicy;
  /** Por defecto `round_robin`. */
  assignmentStrategy?: AssignmentStrategy;
  /** Agentes y cargas (A9); también da el nombre del asesor asignado. */
  agentDirectory?: AgentDirectory | null;
  /** Respuesta automática al vincular (A8). */
  autoReply?: AutoReplySettings | null;
  /** Seguimientos con plantilla (A6), para no vincular antes de que el contacto responda. */
  followups?: FollowupRepository | null;
  logger?: LoggerPort;
}

interface AssignmentOutcome {
  assignedTo: string | null;
  assignedToName: string | null;
}

/**
 * Procesa un webhook de Chatwoot ya autenticado: deduplica, correlaciona la conversación
 * con el lead (por contacto o por código de referencia en el mensaje), enlaza la
 * conversación la primera vez, etiqueta, asigna (round_robin o least_loaded), envía la
 * respuesta automática (una sola vez) y publica `crm.conversation.linked.v1`.
 */
export class HandleChatwootWebhook {
  private readonly logger: LoggerPort;

  constructor(private readonly deps: HandleWebhookDependencies) {
    this.logger = deps.logger ?? noopLogger;
  }

  async execute(raw: unknown): Promise<WebhookHandlingResult> {
    const event = normalizeChatwootWebhook(raw);
    if (!event) {
      this.logger.warn('Webhook con cuerpo no reconocido; se ignora');
      return { outcome: 'ignored', reason: 'unrecognized_body' };
    }
    if (!event.supported) {
      this.logger.debug('Webhook con evento no soportado; se ignora', { eventType: event.eventType });
      return { outcome: 'ignored', reason: 'unsupported_event' };
    }

    const receivedAt = this.deps.clock.now();
    const inserted = await this.deps.webhookEvents.createIfAbsent({
      dedupeKey: event.dedupeKey,
      eventType: event.eventType,
      conversationId: event.conversationId,
      contactId: event.contactId,
      payload: raw,
      signatureValid: true,
      receivedAt,
    });
    if (!inserted) {
      this.logger.info('Webhook duplicado; se ignora', { dedupeKey: event.dedupeKey });
      return { outcome: 'ignored', reason: 'duplicate' };
    }

    let result: WebhookHandlingResult;
    try {
      result = await this.process(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Error al procesar el webhook', { dedupeKey: event.dedupeKey, error: message });
      result = { outcome: 'error', reason: message };
    }
    await this.deps.webhookEvents.finish(event.dedupeKey, result.outcome, this.deps.clock.now());
    return result;
  }

  private async process(event: NormalizedWebhookEvent): Promise<WebhookHandlingResult> {
    if (event.eventType === 'message_created' && event.messageType !== 'incoming') {
      return { outcome: 'ignored', reason: 'not_incoming_message' };
    }
    if (!event.conversationId) {
      return { outcome: 'ignored', reason: 'missing_conversation_id' };
    }

    const link = await this.correlate(event);
    if (!link) {
      this.logger.info('Webhook sin lead asociado', {
        eventType: event.eventType,
        conversationId: event.conversationId,
        contactId: event.contactId,
      });
      return { outcome: 'unmatched', conversationId: event.conversationId };
    }

    if (link.crmConversationId) {
      return {
        outcome: 'ignored',
        reason: link.crmConversationId === event.conversationId ? 'already_linked' : 'another_conversation_linked',
        leadId: link.leadId,
        conversationId: event.conversationId,
      };
    }

    // A6: la conversación que abre la plantilla de seguimiento se vincula cuando el contacto
    // responde (message_created entrante), no al crearse: así la respuesta automática cae
    // dentro de la ventana de 24 h de WhatsApp.
    if (event.eventType !== 'message_created' && event.content === null && this.deps.followups) {
      if (await this.deps.followups.isFollowupConversation(event.conversationId)) {
        return { outcome: 'ignored', reason: 'awaiting_contact_reply', leadId: link.leadId, conversationId: event.conversationId };
      }
    }

    return this.linkConversation(link, event);
  }

  private async correlate(event: NormalizedWebhookEvent): Promise<ContactLink | null> {
    if (event.contactId) {
      const byContact = await this.deps.contactLinks.findByCrmContactId(event.contactId);
      if (byContact) {
        return byContact;
      }
    }
    const reference = extractReference(event.content);
    if (reference) {
      return this.deps.contactLinks.findByReference(reference);
    }
    return null;
  }

  private async linkConversation(link: ContactLink, event: NormalizedWebhookEvent): Promise<WebhookHandlingResult> {
    const conversationId = event.conversationId as string;
    const linkedAt = this.deps.clock.now();
    const job = await this.deps.syncJobs.findByLeadId(link.leadId);
    const payload = job?.payload ?? null;

    const labeled = await this.attempt(link, 'link_conversation', () =>
      this.deps.gateway.setConversationLabels(conversationId, link.labels),
    );
    if (!labeled.ok) {
      this.logger.warn('No se pudieron aplicar etiquetas a la conversación', {
        leadId: link.leadId,
        conversationId,
        error: labeled.error.message,
      });
    }

    const { assignedTo, assignedToName } = await this.assign(link, conversationId, this.assignmentContext(link, payload));

    const updated = await this.deps.contactLinks.markConversationLinked(link.leadId, {
      crmConversationId: conversationId,
      crmInboxId: event.inboxId,
      assignedTo,
      assignedToName,
      conversationLinkedAt: linkedAt,
    });

    await this.autoReply(updated, conversationId, payload, assignedToName);

    const linkedPayload: CrmConversationLinkedPayload = {
      leadId: updated.leadId,
      reference: updated.reference,
      crmContactId: updated.crmContactId,
      crmConversationId: conversationId,
      inboxId: event.inboxId ?? '',
      assignedTo,
      assignedToName,
      linkedAt: linkedAt.toISOString(),
    };
    await this.deps.publisher.publish(crmEnvelope(EventNames.CrmConversationLinked, updated.leadId, linkedPayload, linkedAt));

    this.logger.info('Conversación enlazada con el lead', {
      leadId: updated.leadId,
      reference: updated.reference,
      conversationId,
      assignedTo,
    });
    return { outcome: 'linked', leadId: updated.leadId, conversationId };
  }

  private async assign(link: ContactLink, conversationId: string, context: AssignmentContext): Promise<AssignmentOutcome> {
    const loads = await this.agentLoads(context);
    const decision = this.deps.assignmentPolicy.decide(context, loads);
    if (!decision) {
      return { assignedTo: null, assignedToName: null };
    }
    const assignment = decision.kind === 'team' ? { teamId: decision.teamId } : { assigneeId: decision.agentId };
    const result = await this.attempt(link, 'assign', () => this.deps.gateway.assignConversation(conversationId, assignment));
    if (!result.ok) {
      this.logger.warn('No se pudo asignar la conversación', { leadId: link.leadId, conversationId, error: result.error.message });
      return { assignedTo: null, assignedToName: null };
    }
    if (decision.kind === 'team') {
      return { assignedTo: formatAssignee(decision), assignedToName: null };
    }
    this.deps.agentDirectory?.recordAssignment(decision.agentId);
    const name = loads?.get(decision.agentId)?.name ?? (await this.agentName(decision.agentId));
    return { assignedTo: formatAssignee(decision), assignedToName: name };
  }

  /** A9: cargas de los agentes solo con `least_loaded` y si la regla reparte entre agentes. */
  private async agentLoads(context: AssignmentContext): Promise<ReadonlyMap<number, AgentLoad> | undefined> {
    const directory = this.deps.agentDirectory;
    if (this.deps.assignmentStrategy !== 'least_loaded' || !directory || !this.deps.assignmentPolicy.needsAgentLoads(context)) {
      return undefined;
    }
    try {
      return await directory.loads();
    } catch (error) {
      this.logger.warn('No se pudo consultar la carga de los agentes; se usa round_robin', {
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
  }

  private async agentName(agentId: number): Promise<string | null> {
    if (!this.deps.agentDirectory) {
      return null;
    }
    try {
      return await this.deps.agentDirectory.agentName(agentId);
    } catch (error) {
      this.logger.warn('No se pudo obtener el nombre del agente', {
        agentId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /** A8: mensaje saliente una sola vez por conversación (marca atómica en el vínculo). */
  private async autoReply(link: ContactLink, conversationId: string, payload: LeadCreatedPayload | null, agentName: string | null): Promise<void> {
    const settings = this.deps.autoReply;
    if (!settings?.enabled || !payload) {
      return;
    }
    const claimed = await this.deps.contactLinks.claimAutoReply(link.leadId, this.deps.clock.now());
    if (!claimed) {
      return;
    }
    const content = buildAutoReplyMessage({
      firstName: firstName(payload.fullName),
      promotionName: payload.promotion.name,
      reference: link.reference,
      catalogUrl: settings.catalogUrls[payload.promotion.id] ?? null,
      agentName,
    });
    const sent = await this.attempt(link, 'auto_reply', () => this.deps.gateway.sendOutgoingMessage(conversationId, content));
    if (!sent.ok) {
      this.logger.warn('No se pudo enviar la respuesta automática', { leadId: link.leadId, conversationId, error: sent.error.message });
    }
  }

  /** Marca, promoción, campaña y sede se leen del payload guardado en `sync_jobs`; si falta, de las etiquetas. */
  private assignmentContext(link: ContactLink, payload: LeadCreatedPayload | null): AssignmentContext {
    if (payload) {
      return {
        brand: payload.brand,
        promotionId: payload.promotion.id,
        campaignId: payload.promotion.campaignId,
        campus: payload.campus,
      };
    }
    const find = (prefix: string): string | null => {
      const label = link.labels.find((value) => value.startsWith(prefix));
      return label ? label.slice(prefix.length) : null;
    };
    return { brand: find('marca-') ?? '', promotionId: find('promo-') ?? '', campaignId: find('campania-'), campus: find('sede-') };
  }

  private async attempt<T>(
    link: ContactLink,
    operation: IntegrationOperation,
    action: () => Promise<T>,
  ): Promise<{ ok: true; value: T } | { ok: false; error: IntegrationError }> {
    const startedAt = this.deps.clock.now();
    try {
      const value = await action();
      await this.deps.attempts.record({
        leadId: link.leadId,
        eventId: `webhook:${link.crmContactId}`,
        attempt: 1,
        operation,
        status: 'SUCCESS',
        httpStatus: null,
        error: null,
        startedAt,
        finishedAt: this.deps.clock.now(),
      });
      return { ok: true, value };
    } catch (rawError) {
      const error = IntegrationError.classify(rawError);
      await this.deps.attempts.record({
        leadId: link.leadId,
        eventId: `webhook:${link.crmContactId}`,
        attempt: 1,
        operation,
        status: error.retryable ? 'RETRYABLE_FAILURE' : 'PERMANENT_FAILURE',
        httpStatus: error.httpStatus ?? null,
        error: error.message,
        startedAt,
        finishedAt: this.deps.clock.now(),
      });
      return { ok: false, error };
    }
  }
}
