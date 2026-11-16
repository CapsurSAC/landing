/** Vínculo entre un lead de la landing y su contacto (y conversación) en Chatwoot. */
export interface ContactLink {
  id: string;
  leadId: string;
  reference: string;
  crmAccountId: string;
  crmContactId: string;
  crmConversationId: string | null;
  crmInboxId: string | null;
  /** `team:<id>` o `agent:<id>`; null si no se asignó. */
  assignedTo: string | null;
  /** Nombre visible del asesor (A9); null si se asignó a un equipo o no se conoce. */
  assignedToName: string | null;
  labels: string[];
  syncedAt: Date;
  conversationLinkedAt: Date | null;
  /** Respuesta automática ya enviada (A8). */
  autoReplySentAt: Date | null;
  /** Lead anonimizado (C9). */
  anonymizedAt: Date | null;
}

export interface NewContactLink {
  leadId: string;
  reference: string;
  crmAccountId: string;
  crmContactId: string;
  labels: string[];
  syncedAt: Date;
}

export interface ConversationLinkPatch {
  crmConversationId: string;
  crmInboxId: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  conversationLinkedAt: Date;
}
