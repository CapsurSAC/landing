import { createHash } from 'node:crypto';
import { type LeadCreatedPayload } from '@capsur/api-contracts';

/**
 * Evento `Lead` de Meta Conversions API (A17). Los datos de contacto viajan normalizados y
 * en SHA-256 (requisito de Meta); IP, user agent, `fbc` y `fbp` van sin hash.
 * `event_id` = leadId para que Meta deduplique contra el píxel del navegador.
 */
export interface MetaUserData {
  em?: string[];
  ph?: string[];
  external_id?: string[];
  client_ip_address?: string;
  client_user_agent?: string;
  fbc?: string;
  fbp?: string;
}

export interface MetaServerEvent {
  event_name: 'Lead';
  event_time: number;
  event_id: string;
  action_source: 'website';
  event_source_url?: string;
  user_data: MetaUserData;
  custom_data: {
    currency: 'PEN';
    value: number;
    content_name: string;
    content_ids: string[];
  };
}

export interface MetaEventsRequest {
  data: MetaServerEvent[];
  test_event_code?: string;
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/** Correo normalizado según Meta: sin espacios y en minúsculas. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Teléfono normalizado según Meta: solo dígitos, con código de país (E.164 sin `+`). */
export function normalizePhone(phoneE164: string): string {
  return phoneE164.replace(/\D/g, '');
}

/**
 * `fbc` a partir de la cookie `_fbc` o, si falta, del `fbclid` de la atribución con el
 * formato que documenta Meta: `fb.1.<creación en ms>.<fbclid>`.
 */
export function resolveFbc(payload: Pick<LeadCreatedPayload, 'client' | 'attribution' | 'createdAt'>): string | undefined {
  if (payload.client?.fbc) {
    return payload.client.fbc;
  }
  const fbclid = payload.attribution?.fbclid;
  return fbclid ? `fb.1.${Date.parse(payload.createdAt)}.${fbclid}` : undefined;
}

export function buildMetaLeadEvent(payload: LeadCreatedPayload, options: { testEventCode?: string } = {}): MetaEventsRequest {
  const user: MetaUserData = {};
  const email = normalizeEmail(payload.email);
  if (email) {
    user.em = [sha256Hex(email)];
  }
  const phone = normalizePhone(payload.phone);
  if (phone) {
    user.ph = [sha256Hex(phone)];
  }
  user.external_id = [sha256Hex(payload.leadId)];
  if (payload.client?.ipAddress) {
    user.client_ip_address = payload.client.ipAddress;
  }
  if (payload.client?.userAgent) {
    user.client_user_agent = payload.client.userAgent;
  }
  const fbc = resolveFbc(payload);
  if (fbc) {
    user.fbc = fbc;
  }
  if (payload.client?.fbp) {
    user.fbp = payload.client.fbp;
  }

  const event: MetaServerEvent = {
    event_name: 'Lead',
    event_time: Math.floor(Date.parse(payload.createdAt) / 1000),
    event_id: payload.leadId,
    action_source: 'website',
    user_data: user,
    custom_data: {
      currency: 'PEN',
      // priceAmount viene en céntimos; Meta espera unidades monetarias.
      value: (payload.promotion.priceAmount ?? 0) / 100,
      content_name: payload.promotion.name,
      content_ids: [payload.promotion.id],
    },
  };
  if (payload.client?.eventSourceUrl) {
    event.event_source_url = payload.client.eventSourceUrl;
  }
  return options.testEventCode ? { data: [event], test_event_code: options.testEventCode } : { data: [event] };
}
