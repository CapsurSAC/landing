import { type ContactAttributeValue } from '../../domain/lead-labels';

/** Contacto tal como lo devuelve Chatwoot (solo los campos que usa el servicio). */
export interface ChatwootContact {
  id: string;
  name: string | null;
  phoneNumber: string | null;
  email: string | null;
  customAttributes: Record<string, unknown>;
}

export interface CreateContactInput {
  inboxId: number;
  name: string;
  phoneNumber: string;
  email: string | null;
  customAttributes: Record<string, ContactAttributeValue>;
}

export interface UpdateContactInput {
  name: string;
  email: string | null;
  /** Chatwoot reemplaza el JSON completo: se envía la unión con los atributos existentes. */
  customAttributes: Record<string, unknown>;
}

export type ConversationAssignment = { teamId: number } | { assigneeId: number };

/** Agente de la cuenta (A9). */
export interface ChatwootAgent {
  id: number;
  /** `available_name` o `name`. */
  name: string | null;
  /** `online` | `busy` | `offline` (null si Chatwoot no lo informa). */
  availabilityStatus: string | null;
}

/** Conversación nueva con plantilla de WhatsApp (A6). */
export interface TemplateConversationInput {
  inboxId: number;
  contactId: string;
  content: string;
  template: {
    name: string;
    category: string;
    language: string;
    processedParams: Record<string, string>;
  };
}

/**
 * Puerto hacia Chatwoot. Todas las operaciones lanzan `IntegrationError` clasificado
 * (retryable/permanent); nunca devuelven errores HTTP crudos.
 */
export interface ChatwootGateway {
  /** true si la configuración apunta a una instancia real (no valores de ejemplo). */
  readonly configured: boolean;
  findContactByPhone(phoneE164: string): Promise<ChatwootContact | null>;
  /** null si el contacto no existe (404). */
  getContact(contactId: string): Promise<ChatwootContact | null>;
  createContact(input: CreateContactInput): Promise<ChatwootContact>;
  updateContact(contactId: string, input: UpdateContactInput): Promise<ChatwootContact>;
  /** Reemplaza `custom_attributes` (quien llama envía la unión con los existentes). */
  updateContactAttributes(contactId: string, customAttributes: Record<string, unknown>): Promise<void>;
  /** `not_found` si ya no existía (idempotente). */
  deleteContact(contactId: string): Promise<'deleted' | 'not_found'>;
  getContactLabels(contactId: string): Promise<string[]>;
  setContactLabels(contactId: string, labels: string[]): Promise<string[]>;
  setConversationLabels(conversationId: string, labels: string[]): Promise<string[]>;
  assignConversation(conversationId: string, assignment: ConversationAssignment): Promise<void>;
  /** Mensaje saliente visible para el contacto (A8). */
  sendOutgoingMessage(conversationId: string, content: string): Promise<void>;
  /** Crea una conversación iniciada con una plantilla aprobada (A6). Devuelve su id. */
  createTemplateConversation(input: TemplateConversationInput): Promise<{ conversationId: string }>;
  listAgents(): Promise<ChatwootAgent[]>;
  /** Conversaciones abiertas por agente asignado (paginando `GET /conversations`). */
  countOpenConversationsByAssignee(): Promise<Map<number, number>>;
  /** Comprobación ligera para el health check; nunca lanza. */
  checkAccount(timeoutMs: number): Promise<boolean>;
}
