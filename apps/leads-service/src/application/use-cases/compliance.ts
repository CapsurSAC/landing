import { randomUUID } from 'node:crypto';
import type {
  AdminComplaint,
  AdminPrivacyRequest,
  ComplaintRequest,
  ComplaintResponse,
  PrivacyRequest,
  PrivacyRequestResponse,
} from '@capsur/api-contracts';
import {
  ANONYMIZING_PRIVACY_TYPES,
  COMPLAINT_RESPONSE_BUSINESS_DAYS,
  PRIVACY_RESPONSE_BUSINESS_DAYS,
  formatComplianceCode,
} from '../../domain/compliance';
import { CaptchaInvalidError, CaptchaUnavailableError, ComplaintNotFoundError, PrivacyRequestNotFoundError } from '../../domain/errors';
import { addBusinessDays, limaYearOf } from '../../domain/lima-calendar';
import { PhoneNumber } from '../../domain/phone-number';
import type { Clock } from '../ports/clock';
import type {
  ComplaintProps,
  ComplaintRepository,
  PrivacyRequestProps,
  PrivacyRequestRepository,
} from '../ports/compliance-repository';
import type { LeadRepository } from '../ports/lead-repository';
import type { AppLogger } from '../ports/logger';
import type { CaptchaVerifier, PersonalDataHasher } from '../ports/security';
import { normalizeEmail } from '../support/request-fingerprint';
import type { AnonymizeLead } from './anonymize-lead';

export interface ComplianceSettings {
  /** Prefijo de marca de los códigos (`SIS`). */
  codePrefix: string;
  /** Feriados nacionales `YYYY-MM-DD` (PERU_HOLIDAYS). */
  holidays: ReadonlySet<string>;
}

interface PublicSubmission<T> {
  request: T;
  ipHash: string | null;
  remoteIp: string | null;
}

async function verifyCaptcha(captcha: CaptchaVerifier, token: string | undefined, remoteIp: string | null): Promise<void> {
  const status = await captcha.verify(token, remoteIp);
  if (status === 'invalid') {
    throw new CaptchaInvalidError();
  }
  if (status === 'unavailable') {
    throw new CaptchaUnavailableError();
  }
}

/** Hash del teléfono: E.164 si se puede normalizar (Perú por defecto); si no, solo dígitos. */
export function hashablePhone(raw: string): string {
  try {
    return PhoneNumber.parse(raw, 'PE').e164;
  } catch {
    return raw.replace(/[^\d+]/g, '');
  }
}

/* -------------------------------------------------------------------------- */
/* Libro de Reclamaciones (A5)                                                */
/* -------------------------------------------------------------------------- */

export function toAdminComplaint(complaint: ComplaintProps): AdminComplaint {
  return {
    complaintId: complaint.id,
    code: complaint.code,
    brand: complaint.brand as AdminComplaint['brand'],
    kind: complaint.kind,
    status: complaint.status,
    consumer: {
      fullName: complaint.consumer.fullName,
      documentType: complaint.consumer.documentType,
      documentNumber: complaint.consumer.documentNumber,
      email: complaint.consumer.email,
      phone: complaint.consumer.phone,
    },
    itemDescription: complaint.item.description,
    detail: complaint.detail,
    request: complaint.request,
    receivedAt: complaint.receivedAt.toISOString(),
    responseDueBy: complaint.responseDueBy.toISOString(),
    response: complaint.response,
    respondedAt: complaint.respondedAt ? complaint.respondedAt.toISOString() : null,
  };
}

/** Registra un reclamo/queja con código correlativo sin huecos y plazo de 15 días hábiles. */
export class SubmitComplaint {
  constructor(
    private readonly deps: {
      complaints: ComplaintRepository;
      captcha: CaptchaVerifier;
      hasher: PersonalDataHasher;
      clock: Clock;
      logger: AppLogger;
      settings: ComplianceSettings;
      idFactory?: () => string;
    },
  ) {}

  async execute(input: PublicSubmission<ComplaintRequest>): Promise<ComplaintResponse> {
    const { request } = input;
    await verifyCaptcha(this.deps.captcha, request.captchaToken, input.remoteIp);

    const receivedAt = this.deps.clock.now();
    const year = limaYearOf(receivedAt);
    const email = normalizeEmail(request.consumer.email);
    const created = await this.deps.complaints.createWithSequence(
      {
        id: (this.deps.idFactory ?? randomUUID)(),
        brand: request.brand,
        kind: request.kind,
        status: 'received',
        consumer: {
          fullName: request.consumer.fullName,
          documentType: request.consumer.documentType,
          documentNumber: request.consumer.documentNumber,
          address: request.consumer.address,
          phone: request.consumer.phone,
          email,
          isMinor: request.consumer.isMinor,
          guardianName: request.consumer.guardianName ?? null,
        },
        emailHash: this.deps.hasher.hash(email),
        item: { type: request.item.type, description: request.item.description, amount: request.item.amount ?? null },
        detail: request.detail,
        request: request.request,
        ipHash: input.ipHash,
        receivedAt,
        responseDueBy: addBusinessDays(receivedAt, COMPLAINT_RESPONSE_BUSINESS_DAYS, this.deps.settings.holidays),
        response: null,
        respondedAt: null,
        respondedBy: null,
      },
      {
        kind: 'LR',
        year,
        code: (sequence) => formatComplianceCode(this.deps.settings.codePrefix, 'LR', year, sequence),
      },
    );
    this.deps.logger.info({ complaintId: created.id, code: created.code, kind: created.kind }, 'Reclamo registrado');
    return {
      complaintId: created.id,
      code: created.code,
      receivedAt: created.receivedAt.toISOString(),
      responseDueBy: created.responseDueBy.toISOString(),
    };
  }
}

export class ManageComplaints {
  constructor(
    private readonly deps: {
      complaints: ComplaintRepository;
      clock: Clock;
      logger: AppLogger;
    },
  ) {}

  async list(query: {
    brand?: string;
    status?: ComplaintProps['status'];
    page: number;
    pageSize: number;
  }): Promise<{ items: AdminComplaint[]; page: number; pageSize: number; total: number }> {
    const { items, total } = await this.deps.complaints.list(
      { brand: query.brand, status: query.status },
      { offset: (query.page - 1) * query.pageSize, limit: query.pageSize },
    );
    return { items: items.map(toAdminComplaint), page: query.page, pageSize: query.pageSize, total };
  }

  async respond(id: string, response: string, actor: string | null): Promise<AdminComplaint> {
    const complaint = await this.deps.complaints.findById(id);
    if (!complaint) {
      throw new ComplaintNotFoundError(id);
    }
    const respondedAt = this.deps.clock.now();
    await this.deps.complaints.saveResponse(id, { response, respondedAt, respondedBy: actor });
    this.deps.logger.info({ complaintId: id, code: complaint.code }, 'Reclamo respondido');
    return toAdminComplaint({ ...complaint, status: 'answered', response, respondedAt, respondedBy: actor });
  }
}

/* -------------------------------------------------------------------------- */
/* Derechos ARCO (C9)                                                         */
/* -------------------------------------------------------------------------- */

export function toAdminPrivacyRequest(request: PrivacyRequestProps): AdminPrivacyRequest {
  return {
    requestId: request.id,
    code: request.code,
    brand: request.brand as AdminPrivacyRequest['brand'],
    type: request.type,
    status: request.status,
    fullName: request.fullName,
    email: request.email,
    phone: request.phone,
    reference: request.reference,
    detail: request.detail,
    receivedAt: request.receivedAt.toISOString(),
    responseDueBy: request.responseDueBy.toISOString(),
    resolution: request.resolution,
    resolvedAt: request.resolvedAt ? request.resolvedAt.toISOString() : null,
  };
}

/** Registra una solicitud ARCO con código correlativo y plazo de 20 días hábiles. */
export class SubmitPrivacyRequest {
  constructor(
    private readonly deps: {
      requests: PrivacyRequestRepository;
      captcha: CaptchaVerifier;
      hasher: PersonalDataHasher;
      clock: Clock;
      logger: AppLogger;
      settings: ComplianceSettings;
      idFactory?: () => string;
    },
  ) {}

  async execute(input: PublicSubmission<PrivacyRequest>): Promise<PrivacyRequestResponse> {
    const { request } = input;
    await verifyCaptcha(this.deps.captcha, request.captchaToken, input.remoteIp);

    const receivedAt = this.deps.clock.now();
    const year = limaYearOf(receivedAt);
    const email = normalizeEmail(request.email);
    const phone = request.phone ?? null;
    const created = await this.deps.requests.createWithSequence(
      {
        id: (this.deps.idFactory ?? randomUUID)(),
        brand: request.brand,
        type: request.type,
        status: 'received',
        fullName: request.fullName,
        email,
        emailHash: this.deps.hasher.hash(email),
        phone,
        phoneHash: phone ? this.deps.hasher.hash(hashablePhone(phone)) : null,
        reference: request.reference ? request.reference.toUpperCase() : null,
        detail: request.detail ?? null,
        ipHash: input.ipHash,
        receivedAt,
        responseDueBy: addBusinessDays(receivedAt, PRIVACY_RESPONSE_BUSINESS_DAYS, this.deps.settings.holidays),
        resolution: null,
        resolvedAt: null,
        resolvedBy: null,
      },
      {
        kind: 'ARCO',
        year,
        code: (sequence) => formatComplianceCode(this.deps.settings.codePrefix, 'ARCO', year, sequence),
      },
    );
    this.deps.logger.info({ requestId: created.id, code: created.code, type: created.type }, 'Solicitud ARCO registrada');
    return {
      requestId: created.id,
      code: created.code,
      receivedAt: created.receivedAt.toISOString(),
      responseDueBy: created.responseDueBy.toISOString(),
    };
  }
}

export class ManagePrivacyRequests {
  constructor(
    private readonly deps: {
      requests: PrivacyRequestRepository;
      leads: LeadRepository;
      anonymizeLead: AnonymizeLead;
      clock: Clock;
      logger: AppLogger;
    },
  ) {}

  async list(query: {
    brand?: string;
    status?: PrivacyRequestProps['status'];
    page: number;
    pageSize: number;
  }): Promise<{ items: AdminPrivacyRequest[]; page: number; pageSize: number; total: number }> {
    const { items, total } = await this.deps.requests.list(
      { brand: query.brand, status: query.status },
      { offset: (query.page - 1) * query.pageSize, limit: query.pageSize },
    );
    return { items: items.map(toAdminPrivacyRequest), page: query.page, pageSize: query.pageSize, total };
  }

  /**
   * Registra la resolución. Si `anonymizeLeads` y el tipo es cancelación,
   * oposición o revocación, anonimiza los leads con ese correo/teléfono/código
   * (y pide a crm-bridge borrar el contacto).
   */
  async resolve(
    id: string,
    input: { status: 'in_progress' | 'resolved' | 'rejected'; resolution: string; anonymizeLeads: boolean },
    actor: string | null,
  ): Promise<AdminPrivacyRequest & { anonymizedLeads: number }> {
    const request = await this.deps.requests.findById(id);
    if (!request) {
      throw new PrivacyRequestNotFoundError(id);
    }

    let anonymizedLeads = 0;
    if (input.anonymizeLeads && input.status === 'resolved' && ANONYMIZING_PRIVACY_TYPES.has(request.type)) {
      const leadIds = await this.deps.leads.findIdsByContact({
        emailHash: request.emailHash,
        phoneHash: request.phoneHash,
        reference: request.reference,
      });
      for (const leadId of leadIds) {
        const result = await this.deps.anonymizeLead.execute(leadId, { reason: 'arco_request', deleteCrmContact: true });
        if (result.anonymized) {
          anonymizedLeads += 1;
        }
      }
    }

    const resolvedAt = input.status === 'in_progress' ? null : this.deps.clock.now();
    await this.deps.requests.saveResolution(id, {
      status: input.status,
      resolution: input.resolution,
      resolvedAt,
      resolvedBy: actor,
    });
    this.deps.logger.info(
      { requestId: id, code: request.code, status: input.status, anonymizedLeads },
      'Solicitud ARCO actualizada',
    );
    return {
      ...toAdminPrivacyRequest({ ...request, status: input.status, resolution: input.resolution, resolvedAt, resolvedBy: actor }),
      anonymizedLeads,
    };
  }
}
