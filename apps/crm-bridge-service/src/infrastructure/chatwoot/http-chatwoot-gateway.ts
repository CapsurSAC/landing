import { z } from 'zod';
import { IntegrationError } from '../../domain/integration-error';
import {
  type ChatwootAgent,
  type ChatwootContact,
  type ChatwootGateway,
  type ConversationAssignment,
  type CreateContactInput,
  type TemplateConversationInput,
  type UpdateContactInput,
} from '../../application/ports/chatwoot-gateway';

export interface HttpChatwootGatewayOptions {
  baseUrl: string;
  accountId: string;
  apiAccessToken: string;
  configured: boolean;
  timeoutMs?: number;
  /** Tope de páginas al contar conversaciones abiertas (25 por página en Chatwoot). */
  maxConversationPages?: number;
}

type FetchLike = typeof globalThis.fetch;

const IdSchema = z.union([z.number(), z.string()]).transform((value) => String(value));

const ContactSchema = z.looseObject({
  id: IdSchema,
  name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone_number: z.string().nullable().optional(),
  custom_attributes: z.record(z.string(), z.unknown()).nullable().optional(),
});
type RawContact = z.infer<typeof ContactSchema>;

const SearchResponseSchema = z.looseObject({ payload: z.array(ContactSchema).default([]) });
/** Chatwoot devuelve `{ payload: { contact } }` al crear y `{ payload: contact }` o el contacto plano al leer/actualizar. */
const ContactResponseSchema = z.union([
  z.looseObject({ payload: z.looseObject({ contact: ContactSchema }) }).transform((value) => value.payload.contact),
  z.looseObject({ payload: ContactSchema }).transform((value) => value.payload),
  ContactSchema,
]);
const LabelsResponseSchema = z.union([
  z.looseObject({ payload: z.array(z.string()) }).transform((value) => value.payload),
  z.array(z.string()),
]);

const AgentSchema = z.looseObject({
  id: z.coerce.number().int(),
  name: z.string().nullable().optional(),
  available_name: z.string().nullable().optional(),
  availability_status: z.string().nullable().optional(),
});
const AgentsResponseSchema = z.union([z.array(AgentSchema), z.looseObject({ payload: z.array(AgentSchema) }).transform((value) => value.payload)]);

const ConversationSummarySchema = z.looseObject({
  id: IdSchema.optional(),
  assignee_id: z.coerce.number().int().nullable().optional(),
  meta: z.looseObject({ assignee: z.looseObject({ id: z.coerce.number().int() }).nullable().optional() }).optional(),
});
const ConversationListSchema = z.looseObject({
  data: z.looseObject({
    payload: z.array(ConversationSummarySchema).default([]),
  }),
});
const ConversationCreatedSchema = z.looseObject({ id: IdSchema });

function toContact(raw: RawContact): ChatwootContact {
  return {
    id: raw.id,
    name: raw.name ?? null,
    phoneNumber: raw.phone_number ?? null,
    email: raw.email ?? null,
    customAttributes: raw.custom_attributes ?? {},
  };
}

/**
 * Adaptador HTTP a la Application API de Chatwoot
 * (`{CHATWOOT_BASE_URL}/api/v1/accounts/{accountId}`), cabecera `api_access_token`,
 * timeout con AbortController. Clasifica cada fallo en `IntegrationError`. La URL base se
 * valida contra la allowlist al arrancar (C20).
 */
export class HttpChatwootGateway implements ChatwootGateway {
  readonly configured: boolean;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxConversationPages: number;

  constructor(
    private readonly options: HttpChatwootGatewayOptions,
    private readonly fetchImpl: FetchLike = globalThis.fetch,
  ) {
    this.configured = options.configured;
    this.baseUrl = `${options.baseUrl.replace(/\/+$/, '')}/api/v1/accounts/${encodeURIComponent(options.accountId)}`;
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.maxConversationPages = options.maxConversationPages ?? 40;
  }

  async findContactByPhone(phoneE164: string): Promise<ChatwootContact | null> {
    const data = await this.request('GET', `/contacts/search?q=${encodeURIComponent(phoneE164)}`, undefined, SearchResponseSchema);
    const match = data.payload.find((contact) => contact.phone_number === phoneE164);
    return match ? toContact(match) : null;
  }

  async getContact(contactId: string): Promise<ChatwootContact | null> {
    try {
      const contact = await this.request('GET', `/contacts/${encodeURIComponent(contactId)}`, undefined, ContactResponseSchema);
      return toContact(contact);
    } catch (error) {
      if (error instanceof IntegrationError && error.httpStatus === 404) {
        return null;
      }
      throw error;
    }
  }

  async createContact(input: CreateContactInput): Promise<ChatwootContact> {
    const body = {
      inbox_id: input.inboxId,
      name: input.name,
      phone_number: input.phoneNumber,
      email: input.email ?? undefined,
      custom_attributes: input.customAttributes,
    };
    const contact = await this.request('POST', '/contacts', body, ContactResponseSchema);
    return toContact(contact);
  }

  async updateContact(contactId: string, input: UpdateContactInput): Promise<ChatwootContact> {
    const body = {
      name: input.name,
      email: input.email ?? undefined,
      custom_attributes: input.customAttributes,
    };
    const contact = await this.request('PUT', `/contacts/${encodeURIComponent(contactId)}`, body, ContactResponseSchema);
    return toContact(contact);
  }

  async updateContactAttributes(contactId: string, customAttributes: Record<string, unknown>): Promise<void> {
    await this.request('PUT', `/contacts/${encodeURIComponent(contactId)}`, { custom_attributes: customAttributes }, z.unknown());
  }

  async deleteContact(contactId: string): Promise<'deleted' | 'not_found'> {
    try {
      await this.request('DELETE', `/contacts/${encodeURIComponent(contactId)}`, undefined, z.unknown());
      return 'deleted';
    } catch (error) {
      if (error instanceof IntegrationError && error.httpStatus === 404) {
        return 'not_found';
      }
      throw error;
    }
  }

  async getContactLabels(contactId: string): Promise<string[]> {
    return this.request('GET', `/contacts/${encodeURIComponent(contactId)}/labels`, undefined, LabelsResponseSchema);
  }

  async setContactLabels(contactId: string, labels: string[]): Promise<string[]> {
    return this.request('POST', `/contacts/${encodeURIComponent(contactId)}/labels`, { labels }, LabelsResponseSchema);
  }

  async setConversationLabels(conversationId: string, labels: string[]): Promise<string[]> {
    return this.request('POST', `/conversations/${encodeURIComponent(conversationId)}/labels`, { labels }, LabelsResponseSchema);
  }

  async assignConversation(conversationId: string, assignment: ConversationAssignment): Promise<void> {
    const body = 'teamId' in assignment ? { team_id: assignment.teamId } : { assignee_id: assignment.assigneeId };
    await this.request('POST', `/conversations/${encodeURIComponent(conversationId)}/assignments`, body, z.unknown());
  }

  async sendOutgoingMessage(conversationId: string, content: string): Promise<void> {
    await this.request(
      'POST',
      `/conversations/${encodeURIComponent(conversationId)}/messages`,
      { content, message_type: 'outgoing', private: false },
      z.unknown(),
    );
  }

  async createTemplateConversation(input: TemplateConversationInput): Promise<{ conversationId: string }> {
    const body = {
      inbox_id: input.inboxId,
      contact_id: input.contactId,
      message: {
        content: input.content,
        template_params: {
          name: input.template.name,
          category: input.template.category,
          language: input.template.language,
          processed_params: input.template.processedParams,
        },
      },
    };
    const conversation = await this.request('POST', '/conversations', body, ConversationCreatedSchema);
    return { conversationId: conversation.id };
  }

  async listAgents(): Promise<ChatwootAgent[]> {
    const agents = await this.request('GET', '/agents', undefined, AgentsResponseSchema);
    return agents.map((agent) => ({
      id: agent.id,
      name: agent.available_name ?? agent.name ?? null,
      availabilityStatus: agent.availability_status ?? null,
    }));
  }

  async countOpenConversationsByAssignee(): Promise<Map<number, number>> {
    const counts = new Map<number, number>();
    for (let page = 1; page <= this.maxConversationPages; page += 1) {
      const data = await this.request('GET', `/conversations?assignee_type=all&status=open&page=${page}`, undefined, ConversationListSchema);
      const conversations = data.data.payload;
      for (const conversation of conversations) {
        const assigneeId = conversation.meta?.assignee?.id ?? conversation.assignee_id ?? null;
        if (assigneeId !== null) {
          counts.set(assigneeId, (counts.get(assigneeId) ?? 0) + 1);
        }
      }
      if (conversations.length === 0) {
        break;
      }
    }
    return counts;
  }

  async checkAccount(timeoutMs: number): Promise<boolean> {
    if (!this.configured) {
      return false;
    }
    try {
      const response = await this.send('GET', '', undefined, timeoutMs);
      return response.ok;
    } catch {
      return false;
    }
  }

  private async request<T>(method: string, path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
    if (!this.configured) {
      throw IntegrationError.retryable('Chatwoot no está configurado (URL o token de ejemplo)', { code: 'CHATWOOT_NOT_CONFIGURED' });
    }
    const response = await this.send(method, path, body, this.timeoutMs);
    const text = await response.text();
    if (!response.ok) {
      const detail = text.length > 300 ? `${text.slice(0, 300)}…` : text;
      throw IntegrationError.fromHttpStatus(response.status, `Chatwoot respondió ${response.status} en ${method} ${stripQuery(path)}: ${detail}`, {
        code: 'CHATWOOT_HTTP_ERROR',
      });
    }
    let json: unknown = null;
    if (text.length > 0) {
      try {
        json = JSON.parse(text);
      } catch (error) {
        throw IntegrationError.permanent(`Respuesta de Chatwoot no es JSON en ${method} ${stripQuery(path)}`, {
          httpStatus: response.status,
          cause: error,
        });
      }
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw IntegrationError.permanent(`Respuesta de Chatwoot con forma inesperada en ${method} ${stripQuery(path)}: ${parsed.error.message}`, {
        httpStatus: response.status,
      });
    }
    return parsed.data;
  }

  private async send(method: string, path: string, body: unknown, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          api_access_token: this.options.apiAccessToken,
          accept: 'application/json',
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        redirect: 'error',
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw IntegrationError.retryable(`Timeout (${timeoutMs} ms) llamando a Chatwoot: ${method} ${stripQuery(path)}`, {
          code: 'CHATWOOT_TIMEOUT',
          cause: error,
        });
      }
      const message = error instanceof Error ? error.message : String(error);
      throw IntegrationError.retryable(`Error de red llamando a Chatwoot: ${message}`, { code: 'CHATWOOT_NETWORK', cause: error });
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Las búsquedas llevan el teléfono en la query: nunca aparece en mensajes de error ni logs. */
function stripQuery(path: string): string {
  const index = path.indexOf('?');
  return index === -1 ? path : path.slice(0, index);
}
