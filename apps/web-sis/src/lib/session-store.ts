/**
 * Persistencia en sessionStorage (A15). Todo es opcional: si el navegador
 * bloquea el almacenamiento, la landing sigue funcionando sin restaurar nada.
 *
 * - Borrador del formulario: se guarda mientras se escribe y se borra en
 *   cuanto el registro es exitoso (no quedan datos personales del borrador).
 * - Última solicitud registrada: permite volver a mostrar la confirmación si
 *   el usuario recarga o vuelve a la landing en la misma pestaña.
 */
import type { CreateLeadResponse } from '@capsur/api-contracts';
import { parseCreateLeadResponse } from './api-client';
import { coerceDraft, type LeadFormValues } from './lead-form';

const DRAFT_KEY = 'sis.lead-draft.v1';
const LAST_LEAD_KEY = 'sis.lead.last.v1';
const LEAD_PREFIX = 'sis.lead.';

interface StoredLead {
  response: CreateLeadResponse;
  created: boolean;
  /** Especialidades elegidas en la UI (por si el backend aún no las devuelve). */
  specialtyIds?: string[];
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function read(key: string): unknown {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch {
    // cuota excedida o almacenamiento bloqueado
  }
}

function remove(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // almacenamiento bloqueado
  }
}

export interface LeadDraft {
  values: LeadFormValues;
  promotionId: string | null;
  specialtyIds: string[];
}

export function saveDraft(draft: LeadDraft): void {
  write(DRAFT_KEY, draft);
}

export function loadDraft(): LeadDraft | null {
  const raw = read(DRAFT_KEY);
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const values = coerceDraft(r.values);
  if (!values) return null;
  return {
    values,
    promotionId: typeof r.promotionId === 'string' ? r.promotionId : null,
    specialtyIds: Array.isArray(r.specialtyIds) ? r.specialtyIds.filter((x): x is string => typeof x === 'string').slice(0, 3) : [],
  };
}

export function clearDraft(): void {
  remove(DRAFT_KEY);
}

/** Guarda la respuesta del registro para restaurar la confirmación y reabrir /solicitud/:id. */
export function rememberLead(stored: StoredLead): void {
  write(LAST_LEAD_KEY, stored);
  write(LEAD_PREFIX + stored.response.leadId, stored.response);
}

export function recallLastLead(): StoredLead | null {
  const raw = read(LAST_LEAD_KEY);
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  try {
    return {
      response: parseCreateLeadResponse(r.response),
      created: r.created === true,
      specialtyIds: Array.isArray(r.specialtyIds) ? r.specialtyIds.filter((x): x is string => typeof x === 'string') : [],
    };
  } catch {
    return null;
  }
}

export function recallLeadResponse(leadId: string): CreateLeadResponse | null {
  try {
    const raw = read(LEAD_PREFIX + leadId);
    return raw ? parseCreateLeadResponse(raw) : null;
  } catch {
    return null;
  }
}

const FEEDBACK_PREFIX = 'sis.lead-feedback.';

export function markFeedbackSent(leadId: string): void {
  write(FEEDBACK_PREFIX + leadId, true);
}

export function wasFeedbackSent(leadId: string): boolean {
  return read(FEEDBACK_PREFIX + leadId) === true;
}
