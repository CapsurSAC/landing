import { buildWhatsAppMessage, buildWhatsAppUrl, type Campus } from '@capsur/api-contracts';
import type { LeadProps } from '../../domain/lead';
import type { StoredLeadResponse } from '../ports/idempotency-cache';
import { toContractStatus } from './lead-status-mapper';

export interface WhatsAppSettings {
  whatsappNumber: string;
  brandDisplayName: string;
}

/** Primera palabra del nombre completo, usada en el saludo de WhatsApp. */
export function firstNameOf(fullName: string): string | undefined {
  const [first] = fullName.trim().split(/\s+/);
  return first && first.length > 0 ? first : undefined;
}

/** Mensaje y URL de WhatsApp con el código del lead. */
export function whatsAppLinkFor(
  lead: Pick<LeadProps, 'promotionName' | 'promotionHeadline' | 'reference' | 'fullName'>,
  settings: WhatsAppSettings,
): { number: string; prefilledMessage: string; url: string } {
  const prefilledMessage = buildWhatsAppMessage({
    brandName: settings.brandDisplayName,
    promotionName: lead.promotionName,
    promotionHeadline: lead.promotionHeadline,
    reference: lead.reference,
    firstName: firstNameOf(lead.fullName),
  });
  return {
    number: settings.whatsappNumber,
    prefilledMessage,
    url: buildWhatsAppUrl(settings.whatsappNumber, prefilledMessage),
  };
}

/**
 * Respuesta pública de un lead (la misma para 201, duplicado y replay), sin el
 * `statusToken`, que se firma al devolverla y nunca se guarda.
 */
export function buildLeadResponse(lead: LeadProps, settings: WhatsAppSettings, replayed: boolean): StoredLeadResponse {
  return {
    leadId: lead.id,
    reference: lead.reference,
    status: toContractStatus(lead.status),
    phone: lead.phoneE164,
    campus: lead.campus as Campus,
    promotion: {
      id: lead.promotionId,
      name: lead.promotionName,
      headline: lead.promotionHeadline,
    },
    specialties: lead.specialties.map((specialty) => ({ id: specialty.id, name: specialty.name })),
    whatsapp: whatsAppLinkFor(lead, settings),
    replayed,
  };
}
