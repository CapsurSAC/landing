/**
 * Persistencia en localStorage: el borrador del formulario sobrevive a recargas
 * y a volver otro día. Todo es opcional: si el navegador bloquea el
 * almacenamiento, la landing sigue funcionando sin restaurar nada.
 *
 * - Borrador: se guarda mientras se escribe y se borra al abrir WhatsApp.
 * - Clave del lead: identifica a este navegador ante /api/leads, para que los
 *   guardados a medias actualicen el mismo lead del panel.
 */
import { coerceDraft, type LeadFormValues } from './lead-form';

const DRAFT_KEY = 'sis.lead-draft.v2';
const LEAD_KEY = 'sis.lead-key.v1';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
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

/** Clave estable del lead de este navegador (se crea la primera vez). */
export function leadKey(): string {
  const existing = read(LEAD_KEY);
  if (typeof existing === 'string' && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const fresh = crypto.randomUUID();
  write(LEAD_KEY, fresh);
  return fresh;
}

/** Tras abrir WhatsApp: la próxima solicitud de este navegador será otro lead. */
export function resetLeadKey(): void {
  remove(LEAD_KEY);
}
