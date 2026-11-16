import { FeedbackAlreadySubmittedError, InvalidStateTransitionError } from './errors';

export const LEAD_STATUSES = ['REGISTERED', 'CRM_SYNCING', 'CRM_SYNCED', 'CRM_FAILED'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Transiciones permitidas. CRM_SYNCED es terminal salvo por el enlace de conversación. */
const ALLOWED_TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  REGISTERED: ['CRM_SYNCING', 'CRM_SYNCED', 'CRM_FAILED'],
  CRM_SYNCING: ['CRM_SYNCED', 'CRM_FAILED'],
  CRM_FAILED: ['CRM_SYNCING', 'CRM_SYNCED'],
  CRM_SYNCED: [],
};

/** Texto que sustituye al nombre al anonimizar (C9). */
export const ANONYMIZED_NAME = '[anonimizado]';

export interface LeadSpecialty {
  id: string;
  name: string;
}

export interface LeadExperiment {
  id: string;
  variant: string;
}

export interface LeadFeedback {
  source: string;
  detail: string | null;
  receivedAt: Date;
}

/**
 * Estado completo del lead. Los datos personales (`fullName`, `phoneE164`,
 * `email`) viajan en claro dentro del dominio; el repositorio los cifra al
 * guardar (C8). `phoneHash`/`emailHash` son HMAC para duplicados y búsquedas.
 */
export interface LeadProps {
  id: string;
  reference: string;
  brand: string;
  promotionId: string;
  promotionName: string;
  promotionHeadline: string;
  priceAmount: number | null;
  campaignId: string | null;
  campus: string;
  specialties: LeadSpecialty[];
  fullName: string;
  phoneE164: string;
  phoneHash: string | null;
  phoneCountry: string;
  email: string;
  emailHash: string | null;
  experiment: LeadExperiment | null;
  status: LeadStatus;
  crmContactId: string | null;
  crmConversationId: string | null;
  crmAdvisorName: string | null;
  crmSyncedAt: Date | null;
  crmConversationLinkedAt: Date | null;
  feedback: LeadFeedback | null;
  anonymizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Entidad Lead. Encapsula la máquina de estados de sincronización con el CRM,
 * la encuesta de origen (una vez) y la anonimización; la persistencia la hace
 * el repositorio a partir de `toProps()`.
 */
export class Lead {
  private constructor(private readonly props: LeadProps) {}

  static fromProps(props: LeadProps): Lead {
    return new Lead({ ...props, specialties: [...props.specialties] });
  }

  static canTransition(from: LeadStatus, to: LeadStatus): boolean {
    return ALLOWED_TRANSITIONS[from].includes(to);
  }

  get id(): string {
    return this.props.id;
  }

  get reference(): string {
    return this.props.reference;
  }

  get status(): LeadStatus {
    return this.props.status;
  }

  get brand(): string {
    return this.props.brand;
  }

  get phoneE164(): string {
    return this.props.phoneE164;
  }

  get promotionId(): string {
    return this.props.promotionId;
  }

  get crmSyncedAt(): Date | null {
    return this.props.crmSyncedAt;
  }

  get crmConversationId(): string | null {
    return this.props.crmConversationId;
  }

  get crmAdvisorName(): string | null {
    return this.props.crmAdvisorName;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get isAnonymized(): boolean {
    return this.props.anonymizedAt !== null;
  }

  /** El outbox publicó `lead.created.v1`: el CRM está en proceso de sincronizar. */
  markCrmSyncing(now: Date): void {
    this.transition('CRM_SYNCING', now);
  }

  /** El CRM confirmó la creación del contacto. */
  markCrmSynced(crmContactId: string, syncedAt: Date, now: Date): void {
    this.transition('CRM_SYNCED', now);
    this.props.crmContactId = crmContactId;
    this.props.crmSyncedAt = syncedAt;
  }

  /**
   * El CRM enlazó una conversación. Implica que el contacto existe, así que si
   * el evento `contact.synced` llegó desordenado, el lead pasa igualmente a CRM_SYNCED.
   */
  linkCrmConversation(input: {
    crmContactId: string;
    crmConversationId: string;
    advisorName: string | null;
    linkedAt: Date;
    now: Date;
  }): void {
    if (this.props.status !== 'CRM_SYNCED') {
      this.transition('CRM_SYNCED', input.now);
      this.props.crmSyncedAt ??= input.linkedAt;
    }
    this.props.crmContactId ??= input.crmContactId;
    this.props.crmConversationId = input.crmConversationId;
    this.props.crmConversationLinkedAt = input.linkedAt;
    if (input.advisorName !== null) {
      this.props.crmAdvisorName = input.advisorName.slice(0, 120);
    }
    this.props.updatedAt = input.now;
  }

  /** El CRM agotó los reintentos. */
  markCrmFailed(now: Date): void {
    this.transition('CRM_FAILED', now);
  }

  /** «¿Cómo nos conociste?»: solo se acepta una respuesta por lead (A21). */
  recordFeedback(source: string, detail: string | null, now: Date): void {
    if (this.props.feedback !== null) {
      throw new FeedbackAlreadySubmittedError();
    }
    this.props.feedback = { source, detail, receivedAt: now };
    this.props.updatedAt = now;
  }

  /**
   * Anonimiza el lead (C9): nombre fijo, teléfono y correo vacíos, hashes nulos.
   * Devuelve `false` si ya estaba anonimizado (operación idempotente).
   */
  anonymize(now: Date): boolean {
    if (this.props.anonymizedAt !== null) {
      return false;
    }
    this.props.fullName = ANONYMIZED_NAME;
    this.props.phoneE164 = '';
    this.props.email = '';
    this.props.phoneHash = null;
    this.props.emailHash = null;
    this.props.feedback = this.props.feedback ? { ...this.props.feedback, detail: null } : null;
    this.props.anonymizedAt = now;
    this.props.updatedAt = now;
    return true;
  }

  toProps(): LeadProps {
    return { ...this.props, specialties: [...this.props.specialties] };
  }

  private transition(to: LeadStatus, now: Date): void {
    if (!Lead.canTransition(this.props.status, to)) {
      throw new InvalidStateTransitionError(this.props.status, to);
    }
    this.props.status = to;
    this.props.updatedAt = now;
  }
}
