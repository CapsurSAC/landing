import { z } from 'zod';

/**
 * Normalización de los webhooks de Chatwoot. Chatwoot envía objetos distintos según el
 * evento (la conversación completa o el mensaje con su conversación anidada); aquí se
 * extrae solo lo necesario para correlacionar con el lead.
 */
export const SUPPORTED_WEBHOOK_EVENTS = [
  'conversation_created',
  'message_created',
  'conversation_updated',
  'conversation_status_changed',
] as const;
export type SupportedWebhookEvent = (typeof SUPPORTED_WEBHOOK_EVENTS)[number];

const IdSchema = z.union([z.number(), z.string()]).transform((value) => String(value));

const ActorSchema = z.looseObject({
  id: IdSchema.optional(),
  type: z.string().optional(),
});

const MessageSchema = z.looseObject({
  id: IdSchema.optional(),
  content: z.string().nullable().optional(),
  message_type: z.union([z.string(), z.number()]).optional(),
  sender: ActorSchema.nullable().optional(),
});

const ConversationSchema = z.looseObject({
  id: IdSchema.optional(),
  inbox_id: IdSchema.optional(),
  status: z.string().optional(),
  updated_at: z.union([z.string(), z.number()]).optional(),
  meta: z.looseObject({ sender: ActorSchema.nullable().optional() }).optional(),
  messages: z.array(MessageSchema).optional(),
});

const WebhookSchema = z.looseObject({
  event: z.string(),
  id: IdSchema.optional(),
  inbox_id: IdSchema.optional(),
  content: z.string().nullable().optional(),
  message_type: z.union([z.string(), z.number()]).optional(),
  status: z.string().optional(),
  updated_at: z.union([z.string(), z.number()]).optional(),
  conversation: ConversationSchema.optional(),
  inbox: z.looseObject({ id: IdSchema.optional() }).optional(),
  sender: ActorSchema.nullable().optional(),
  contact: ActorSchema.nullable().optional(),
  meta: z.looseObject({ sender: ActorSchema.nullable().optional() }).optional(),
  messages: z.array(MessageSchema).optional(),
});

export interface NormalizedWebhookEvent {
  eventType: string;
  supported: boolean;
  conversationId: string | null;
  inboxId: string | null;
  contactId: string | null;
  messageId: string | null;
  /** `incoming`, `outgoing`, `activity`, `template` o null si no aplica. */
  messageType: string | null;
  /** Contenido del mensaje entrante (o del primer mensaje entrante de la conversación). */
  content: string | null;
  dedupeKey: string;
}

const MESSAGE_TYPE_NAMES: Record<number, string> = { 0: 'incoming', 1: 'outgoing', 2: 'activity', 3: 'template' };

function normalizeMessageType(value: string | number | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return MESSAGE_TYPE_NAMES[value] ?? String(value);
  }
  return value.toLowerCase();
}

function isContactActor(actor: z.infer<typeof ActorSchema> | null | undefined): actor is z.infer<typeof ActorSchema> {
  if (!actor || actor.id === undefined) {
    return false;
  }
  return actor.type === undefined || actor.type.toLowerCase() === 'contact';
}

/** Devuelve null solo si el cuerpo no tiene la forma mínima de un webhook de Chatwoot. */
export function normalizeChatwootWebhook(raw: unknown): NormalizedWebhookEvent | null {
  const parsed = WebhookSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const body = parsed.data;
  const eventType = body.event;
  const supported = (SUPPORTED_WEBHOOK_EVENTS as readonly string[]).includes(eventType);

  if (eventType === 'message_created') {
    const conversation = body.conversation;
    const messageType = normalizeMessageType(body.message_type);
    const sender = body.sender;
    const contactId =
      (messageType === 'incoming' && isContactActor(sender) ? sender.id : undefined) ??
      conversation?.meta?.sender?.id ??
      body.contact?.id ??
      null;
    const conversationId = conversation?.id ?? null;
    const messageId = body.id ?? null;
    return {
      eventType,
      supported,
      conversationId,
      inboxId: body.inbox?.id ?? conversation?.inbox_id ?? body.inbox_id ?? null,
      contactId,
      messageId,
      messageType,
      content: messageType === 'incoming' ? (body.content ?? null) : null,
      dedupeKey: `${eventType}:${conversationId ?? ''}:${messageId ?? ''}`,
    };
  }

  // Eventos de conversación: el cuerpo es la conversación.
  const firstIncoming = (body.messages ?? []).find((message) => normalizeMessageType(message.message_type) === 'incoming');
  const conversationId = body.id ?? null;
  const discriminator = body.updated_at !== undefined ? String(body.updated_at) : (body.status ?? '');
  return {
    eventType,
    supported,
    conversationId,
    inboxId: body.inbox_id ?? body.inbox?.id ?? null,
    contactId: body.meta?.sender?.id ?? body.contact?.id ?? null,
    messageId: firstIncoming?.id ?? null,
    messageType: null,
    content: firstIncoming?.content ?? null,
    dedupeKey: `${eventType}:${conversationId ?? ''}:${discriminator}`,
  };
}
