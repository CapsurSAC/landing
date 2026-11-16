import { type LeadCreatedPayload } from '@capsur/api-contracts';

export const LABEL_ORIGIN_LANDING = 'origen-landing';

/** Etiqueta de sede (A4): `sede-tacna`, `sede-arequipa`. */
export function campusLabel(campus: string): string {
  return `sede-${campus}`;
}

/** Etiquetas que identifican marca, promoción, campaña, sede y origen del lead en Chatwoot. */
export function buildLeadLabels(payload: LeadCreatedPayload): string[] {
  const labels = [`marca-${payload.brand}`, `promo-${payload.promotion.id}`];
  if (payload.promotion.campaignId) {
    labels.push(`campania-${payload.promotion.campaignId}`);
  }
  labels.push(campusLabel(payload.campus));
  labels.push(LABEL_ORIGIN_LANDING);
  return labels;
}

/** Chatwoot reemplaza la lista completa de etiquetas: se envía la unión sin duplicados. */
export function mergeLabels(existing: readonly string[], wanted: readonly string[]): string[] {
  const merged: string[] = [];
  for (const label of [...existing, ...wanted]) {
    const normalized = label.trim();
    if (normalized.length > 0 && !merged.includes(normalized)) {
      merged.push(normalized);
    }
  }
  return merged;
}

export type ContactAttributeValue = string | boolean | null;

/** Atributos personalizados del contacto. Solo datos necesarios para la gestión comercial. */
export function buildContactAttributes(payload: LeadCreatedPayload): Record<string, ContactAttributeValue> {
  const attribution = payload.attribution ?? {};
  return {
    lead_reference: payload.reference,
    lead_id: payload.leadId,
    brand: payload.brand,
    campus: payload.campus,
    promotion_id: payload.promotion.id,
    promotion_name: payload.promotion.name,
    campaign_id: payload.promotion.campaignId,
    // A4: especialidades elegidas (nombres visibles separados por comas); null si "lo decido con un asesor".
    specialties: payload.specialties.length > 0 ? payload.specialties.map((specialty) => specialty.name).join(', ') : null,
    utm_source: attribution.utmSource ?? null,
    utm_medium: attribution.utmMedium ?? null,
    utm_campaign: attribution.utmCampaign ?? null,
    consent_privacy_version: payload.consent.privacyVersion,
    consent_marketing: payload.consent.marketingAccepted,
    landing_submitted_at: payload.createdAt,
  };
}

/** Nombre de pila para saludos (primera palabra del nombre completo). */
export function firstName(fullName: string): string {
  const [first = ''] = fullName.trim().split(/\s+/);
  return first;
}
