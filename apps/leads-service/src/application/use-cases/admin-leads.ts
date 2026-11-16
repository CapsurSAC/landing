import {
  REFERENCE_PATTERN,
  type AdminLead,
  type AdminLeadListQuery,
  type AdminLeadListResponse,
  type LeadFeedbackSource,
} from '@capsur/api-contracts';
import { LeadNotFoundError } from '../../domain/errors';
import { PhoneNumber } from '../../domain/phone-number';
import type { AdminLeadRecord, LeadListFilter, LeadRepository } from '../ports/lead-repository';
import type { PersonalDataHasher } from '../ports/security';
import { fromContractStatus, toContractStatus } from '../support/lead-status-mapper';
import { normalizeEmail } from '../support/request-fingerprint';
import type { AnonymizeLead, AnonymizeLeadResult } from './anonymize-lead';

/** Máximo de filas del CSV (spec §3). */
export const CSV_MAX_ROWS = 10_000;
const CSV_PAGE_SIZE = 1000;

export function toAdminLead(record: AdminLeadRecord): AdminLead {
  const { lead } = record;
  return {
    leadId: lead.id,
    reference: lead.reference,
    brand: lead.brand as AdminLead['brand'],
    createdAt: lead.createdAt.toISOString(),
    fullName: lead.fullName,
    phone: lead.phoneE164,
    email: lead.email,
    campus: lead.campus as AdminLead['campus'],
    promotion: { id: lead.promotionId, name: lead.promotionName, headline: lead.promotionHeadline },
    specialtyIds: lead.specialties.map((specialty) => specialty.id),
    status: toContractStatus(lead.status),
    crm: {
      contactId: lead.crmContactId,
      conversationId: lead.crmConversationId,
      syncedAt: lead.crmSyncedAt ? lead.crmSyncedAt.toISOString() : null,
      conversationLinkedAt: lead.crmConversationLinkedAt ? lead.crmConversationLinkedAt.toISOString() : null,
    },
    attribution: record.attribution,
    consent: record.consent ?? { marketingAccepted: false, privacyVersion: '' },
    feedbackSource: (lead.feedback?.source as LeadFeedbackSource | undefined) ?? null,
    anonymized: lead.anonymizedAt !== null,
  };
}

/** Celda CSV segura: comillas, saltos de línea e inyección de fórmulas (=, +, -, @). */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",;\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_COLUMNS: ReadonlyArray<[string, (lead: AdminLead) => string | number | boolean | null]> = [
  ['leadId', (l) => l.leadId],
  ['reference', (l) => l.reference],
  ['createdAt', (l) => l.createdAt],
  ['brand', (l) => l.brand],
  ['fullName', (l) => l.fullName],
  ['phone', (l) => l.phone],
  ['email', (l) => l.email],
  ['campus', (l) => l.campus],
  ['promotionId', (l) => l.promotion.id],
  ['promotionName', (l) => l.promotion.name],
  ['specialtyIds', (l) => l.specialtyIds.join('|')],
  ['status', (l) => l.status],
  ['crmContactId', (l) => l.crm.contactId],
  ['crmSyncedAt', (l) => l.crm.syncedAt],
  ['conversationLinkedAt', (l) => l.crm.conversationLinkedAt],
  ['utmSource', (l) => l.attribution?.utmSource ?? null],
  ['utmMedium', (l) => l.attribution?.utmMedium ?? null],
  ['utmCampaign', (l) => l.attribution?.utmCampaign ?? null],
  ['marketingAccepted', (l) => l.consent.marketingAccepted],
  ['privacyVersion', (l) => l.consent.privacyVersion],
  ['feedbackSource', (l) => l.feedbackSource],
  ['anonymized', (l) => l.anonymized],
];

/** CSV con BOM (Excel lo abre en UTF-8) y fin de línea CRLF. */
export function leadsToCsv(leads: readonly AdminLead[]): string {
  const header = CSV_COLUMNS.map(([name]) => name).join(',');
  const rows = leads.map((lead) => CSV_COLUMNS.map(([, read]) => csvCell(read(lead))).join(','));
  return `﻿${[header, ...rows].join('\r\n')}\r\n`;
}

/**
 * Vista de leads para el panel (A2): lista con filtros, CSV, detalle y
 * anonimización manual. Único punto donde se devuelven datos personales
 * descifrados (siempre bajo token interno y auditoría).
 */
export class AdminLeads {
  constructor(
    private readonly deps: {
      leads: LeadRepository;
      hasher: PersonalDataHasher;
      anonymizeLead: AnonymizeLead;
    },
  ) {}

  async list(query: AdminLeadListQuery): Promise<AdminLeadListResponse> {
    const filter = this.toFilter(query);
    if (filter === null) {
      return { items: [], page: query.page, pageSize: query.pageSize, total: 0 };
    }
    const { items, total } = await this.deps.leads.list(filter, {
      offset: (query.page - 1) * query.pageSize,
      limit: query.pageSize,
    });
    return { items: items.map(toAdminLead), page: query.page, pageSize: query.pageSize, total };
  }

  async exportCsv(query: Omit<AdminLeadListQuery, 'page' | 'pageSize'>): Promise<{ csv: string; rows: number; truncated: boolean }> {
    const filter = this.toFilter(query);
    const leads: AdminLead[] = [];
    let total = 0;
    if (filter !== null) {
      for (let offset = 0; offset < CSV_MAX_ROWS; offset += CSV_PAGE_SIZE) {
        const page = await this.deps.leads.list(filter, { offset, limit: Math.min(CSV_PAGE_SIZE, CSV_MAX_ROWS - offset) });
        total = page.total;
        leads.push(...page.items.map(toAdminLead));
        if (page.items.length < CSV_PAGE_SIZE || leads.length >= total) {
          break;
        }
      }
    }
    return { csv: leadsToCsv(leads), rows: leads.length, truncated: total > leads.length };
  }

  async get(leadId: string): Promise<AdminLead> {
    const record = await this.deps.leads.findAdminRecord(leadId);
    if (!record) {
      throw new LeadNotFoundError(leadId);
    }
    return toAdminLead(record);
  }

  async anonymize(leadId: string, deleteCrmContact: boolean): Promise<AnonymizeLeadResult> {
    return this.deps.anonymizeLead.execute(leadId, { reason: 'admin', deleteCrmContact });
  }

  /**
   * Traduce la consulta a filtros del repositorio. `q` es una referencia
   * exacta (SIS-XXXXX) o un correo/teléfono exactos, que se comparan por hash.
   * Devuelve `null` si `q` no puede coincidir con nada.
   */
  private toFilter(query: Omit<AdminLeadListQuery, 'page' | 'pageSize'>): LeadListFilter | null {
    const filter: LeadListFilter = {
      brand: query.brand,
      status: query.status ? fromContractStatus(query.status) : undefined,
      promotionId: query.promotionId,
      campus: query.campus,
      utmCampaign: query.utmCampaign,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
    };
    const q = query.q?.trim();
    if (!q) {
      return filter;
    }
    if (REFERENCE_PATTERN.test(q.toUpperCase())) {
      return { ...filter, reference: q.toUpperCase() };
    }
    if (q.includes('@')) {
      return { ...filter, emailHash: this.deps.hasher.hash(normalizeEmail(q)) };
    }
    try {
      return { ...filter, phoneHash: this.deps.hasher.hash(PhoneNumber.parse(q, 'PE').e164) };
    } catch {
      return null;
    }
  }
}
