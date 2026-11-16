import type { Attribution } from '@capsur/api-contracts';
import type { Lead, LeadProps, LeadStatus } from '../../domain/lead';
import type { NewOutboxEvent } from './outbox-repository';
import type { NewSubmission } from './submission-repository';

export interface NewConsentRecord {
  contactAccepted: boolean;
  marketingAccepted: boolean;
  privacyVersion: string;
  acceptedAt: Date;
  ipHash: string | null;
  userAgent: string | null;
}

/** Notificación a encolar junto con el lead (correo de confirmación, A7). */
export interface NewNotification {
  id: string;
  channel: 'email';
  template: string;
  createdAt: Date;
}

/** Todo lo que se persiste en la misma transacción al crear un lead. */
export interface CreateLeadAggregate {
  lead: LeadProps;
  consent: NewConsentRecord;
  attribution: Attribution | null;
  submission: NewSubmission;
  outboxEvent: NewOutboxEvent;
  notification: NewNotification | null;
}

export interface ProcessedEventMark {
  id: string;
  name: string;
  processedAt: Date;
}

/** Filtros de la lista del panel (A2). La búsqueda `q` ya llega resuelta a hashes o referencia. */
export interface LeadListFilter {
  brand?: string;
  status?: LeadStatus;
  promotionId?: string;
  campus?: string;
  utmCampaign?: string;
  from?: Date;
  to?: Date;
  reference?: string;
  emailHash?: string;
  phoneHash?: string;
}

/** Lead con los datos que muestra el panel (ya descifrados). */
export interface AdminLeadRecord {
  lead: LeadProps;
  attribution: Attribution | null;
  consent: { marketingAccepted: boolean; privacyVersion: string } | null;
}

export interface LeadRepository {
  findById(id: string): Promise<Lead | null>;
  /** Lead de la misma marca, teléfono (hash) y promoción creado a partir de `since`. */
  findRecentDuplicate(input: { brand: string; phoneHash: string; promotionId: string; since: Date }): Promise<Lead | null>;
  /**
   * Crea lead + consentimiento + atribución + submission + evento outbox (+
   * notificación) en UNA transacción. Lanza `ReferenceCollisionError` si la
   * referencia ya existe.
   */
  createWithOutbox(aggregate: CreateLeadAggregate): Promise<void>;
  save(lead: Lead): Promise<void>;
  /** Guarda el lead y marca el evento como procesado en la misma transacción. */
  saveWithProcessedEvent(lead: Lead, event: ProcessedEventMark): Promise<void>;
  /** REGISTERED → CRM_SYNCING en lote (tras publicar `lead.created.v1`). Devuelve cuántos cambiaron. */
  markSyncingIfRegistered(leadIds: readonly string[], now: Date): Promise<number>;
  /**
   * Guarda la encuesta y encola `lead.feedback.v1` en una transacción, solo si
   * el lead aún no tenía respuesta. Devuelve `false` si otra petición ganó.
   */
  saveFeedback(lead: Lead, outboxEvent: NewOutboxEvent): Promise<boolean>;
  /**
   * Persiste la anonimización (C9) en una transacción: datos del lead, borra la
   * atribución, pone a NULL ip_hash/user_agent del consentimiento y de las
   * submissions, vacía las respuestas guardadas y los payloads de outbox ya
   * publicados del lead, y encola `lead.anonymized.v1`.
   */
  saveAnonymized(lead: Lead, outboxEvent: NewOutboxEvent): Promise<void>;
  /** Ids de leads no anonimizados creados antes de `createdBefore` (retención). */
  findIdsCreatedBefore(createdBefore: Date, limit: number): Promise<string[]>;
  /** Ids de leads no anonimizados que coinciden con alguno de los criterios (ARCO). */
  findIdsByContact(input: { emailHash?: string | null; phoneHash?: string | null; reference?: string | null }): Promise<string[]>;
  list(filter: LeadListFilter, page: { offset: number; limit: number }): Promise<{ items: AdminLeadRecord[]; total: number }>;
  findAdminRecord(id: string): Promise<AdminLeadRecord | null>;
}

export const LEAD_REPOSITORY = Symbol('LEAD_REPOSITORY');
