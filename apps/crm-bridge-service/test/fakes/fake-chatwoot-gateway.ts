import {
  type ChatwootAgent,
  type ChatwootContact,
  type ChatwootGateway,
  type ConversationAssignment,
  type CreateContactInput,
  type TemplateConversationInput,
  type UpdateContactInput,
} from '../../src/application/ports/chatwoot-gateway';
import { IntegrationError } from '../../src/domain/integration-error';

export interface RecordedCall {
  method: keyof ChatwootGateway;
  args: unknown[];
}

/** Chatwoot en memoria. `failWith` fuerza un estado HTTP en la siguiente operación indicada. */
export class FakeChatwootGateway implements ChatwootGateway {
  configured = true;
  readonly contacts = new Map<string, ChatwootContact>();
  readonly contactLabels = new Map<string, string[]>();
  readonly conversationLabels = new Map<string, string[]>();
  readonly assignments = new Map<string, ConversationAssignment>();
  readonly messages: Array<{ conversationId: string; content: string }> = [];
  readonly templateConversations: TemplateConversationInput[] = [];
  readonly deletedContacts: string[] = [];
  agents: ChatwootAgent[] = [];
  openConversations = new Map<number, number>();
  readonly calls: RecordedCall[] = [];
  private failures = new Map<keyof ChatwootGateway, number[]>();
  private sequence = 100;

  /** Fuerza `httpStatus` en las próximas `times` llamadas a `method`. */
  failWith(method: keyof ChatwootGateway, httpStatus: number, times = 1): void {
    this.failures.set(method, [...(this.failures.get(method) ?? []), ...Array.from({ length: times }, () => httpStatus)]);
  }

  seedContact(contact: Partial<ChatwootContact> & { phoneNumber: string }): ChatwootContact {
    const full: ChatwootContact = {
      id: contact.id ?? String(++this.sequence),
      name: contact.name ?? null,
      phoneNumber: contact.phoneNumber,
      email: contact.email ?? null,
      customAttributes: contact.customAttributes ?? {},
    };
    this.contacts.set(full.id, full);
    return full;
  }

  calledMethods(): Array<keyof ChatwootGateway> {
    return this.calls.map((call) => call.method);
  }

  callsTo(method: keyof ChatwootGateway): RecordedCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  async findContactByPhone(phoneE164: string): Promise<ChatwootContact | null> {
    this.track('findContactByPhone', [phoneE164]);
    return [...this.contacts.values()].find((contact) => contact.phoneNumber === phoneE164) ?? null;
  }

  async getContact(contactId: string): Promise<ChatwootContact | null> {
    this.track('getContact', [contactId]);
    return this.contacts.get(contactId) ?? null;
  }

  async createContact(input: CreateContactInput): Promise<ChatwootContact> {
    this.track('createContact', [input]);
    const contact: ChatwootContact = {
      id: String(++this.sequence),
      name: input.name,
      phoneNumber: input.phoneNumber,
      email: input.email,
      customAttributes: { ...input.customAttributes },
    };
    this.contacts.set(contact.id, contact);
    return contact;
  }

  async updateContact(contactId: string, input: UpdateContactInput): Promise<ChatwootContact> {
    this.track('updateContact', [contactId, input]);
    const existing = this.contacts.get(contactId);
    if (!existing) {
      throw IntegrationError.permanent('Contacto no encontrado', { httpStatus: 404 });
    }
    const updated: ChatwootContact = { ...existing, name: input.name, email: input.email, customAttributes: { ...input.customAttributes } };
    this.contacts.set(contactId, updated);
    return updated;
  }

  async updateContactAttributes(contactId: string, customAttributes: Record<string, unknown>): Promise<void> {
    this.track('updateContactAttributes', [contactId, customAttributes]);
    const existing = this.contacts.get(contactId);
    if (!existing) {
      throw IntegrationError.permanent('Contacto no encontrado', { httpStatus: 404 });
    }
    this.contacts.set(contactId, { ...existing, customAttributes: { ...customAttributes } });
  }

  async deleteContact(contactId: string): Promise<'deleted' | 'not_found'> {
    this.track('deleteContact', [contactId]);
    this.deletedContacts.push(contactId);
    return this.contacts.delete(contactId) ? 'deleted' : 'not_found';
  }

  async getContactLabels(contactId: string): Promise<string[]> {
    this.track('getContactLabels', [contactId]);
    return [...(this.contactLabels.get(contactId) ?? [])];
  }

  async setContactLabels(contactId: string, labels: string[]): Promise<string[]> {
    this.track('setContactLabels', [contactId, labels]);
    this.contactLabels.set(contactId, [...labels]);
    return [...labels];
  }

  async setConversationLabels(conversationId: string, labels: string[]): Promise<string[]> {
    this.track('setConversationLabels', [conversationId, labels]);
    this.conversationLabels.set(conversationId, [...labels]);
    return [...labels];
  }

  async assignConversation(conversationId: string, assignment: ConversationAssignment): Promise<void> {
    this.track('assignConversation', [conversationId, assignment]);
    this.assignments.set(conversationId, assignment);
  }

  async sendOutgoingMessage(conversationId: string, content: string): Promise<void> {
    this.track('sendOutgoingMessage', [conversationId, content]);
    this.messages.push({ conversationId, content });
  }

  async createTemplateConversation(input: TemplateConversationInput): Promise<{ conversationId: string }> {
    this.track('createTemplateConversation', [input]);
    this.templateConversations.push(input);
    return { conversationId: String(++this.sequence) };
  }

  async listAgents(): Promise<ChatwootAgent[]> {
    this.track('listAgents', []);
    return this.agents.map((agent) => ({ ...agent }));
  }

  async countOpenConversationsByAssignee(): Promise<Map<number, number>> {
    this.track('countOpenConversationsByAssignee', []);
    return new Map(this.openConversations);
  }

  async checkAccount(): Promise<boolean> {
    return this.configured;
  }

  private track(method: keyof ChatwootGateway, args: unknown[]): void {
    this.calls.push({ method, args });
    const pending = this.failures.get(method);
    const status = pending?.shift();
    if (status !== undefined) {
      throw IntegrationError.fromHttpStatus(status, `Chatwoot respondió ${status} en ${method}`);
    }
  }
}
