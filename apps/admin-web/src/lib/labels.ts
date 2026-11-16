import type { Campus, LeadFeedbackSource, LeadStatus, PrivacyRequestType, SpecialtyTrack } from '@capsur/api-contracts';

/** Textos en español para los valores de los contratos. */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export const LEAD_STATUS: Record<LeadStatus, { label: string; tone: Tone }> = {
  registered: { label: 'Registrado', tone: 'neutral' },
  crm_syncing: { label: 'Sincronizando', tone: 'info' },
  crm_synced: { label: 'En CRM', tone: 'success' },
  crm_failed: { label: 'Fallo CRM', tone: 'danger' },
};

export const CAMPUS: Record<Campus, string> = { tacna: 'Tacna', arequipa: 'Arequipa' };

export const TRACK: Record<SpecialtyTrack, string> = { ia: 'Con IA', tradicional: 'Tradicional' };

export const FEEDBACK_SOURCE: Record<LeadFeedbackSource, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  google: 'Google',
  youtube: 'YouTube',
  recomendacion: 'Recomendación',
  colegio: 'Colegio',
  otro: 'Otro',
};

export const COMPLAINT_STATUS: Record<'received' | 'in_progress' | 'answered', { label: string; tone: Tone }> = {
  received: { label: 'Recibido', tone: 'warning' },
  in_progress: { label: 'En trámite', tone: 'info' },
  answered: { label: 'Respondido', tone: 'success' },
};

export const COMPLAINT_KIND: Record<'reclamo' | 'queja', string> = { reclamo: 'Reclamo', queja: 'Queja' };

export const PRIVACY_STATUS: Record<'received' | 'in_progress' | 'resolved' | 'rejected', { label: string; tone: Tone }> = {
  received: { label: 'Recibida', tone: 'warning' },
  in_progress: { label: 'En trámite', tone: 'info' },
  resolved: { label: 'Resuelta', tone: 'success' },
  rejected: { label: 'Rechazada', tone: 'neutral' },
};

export const PRIVACY_TYPE: Record<PrivacyRequestType, string> = {
  access: 'Acceso',
  rectification: 'Rectificación',
  cancellation: 'Cancelación',
  opposition: 'Oposición',
  revoke_consent: 'Revocación del consentimiento',
};

export const HEALTH_STATUS: Record<'ok' | 'degraded' | 'down', { label: string; tone: Tone }> = {
  ok: { label: 'Operativo', tone: 'success' },
  degraded: { label: 'Degradado', tone: 'warning' },
  down: { label: 'Caído', tone: 'danger' },
};

export const SERVICE_LABEL: Record<'promotions' | 'leads' | 'crm', string> = {
  promotions: 'promotions-service',
  leads: 'leads-service',
  crm: 'crm-bridge-service',
};

export function percent(part: number, whole: number): string {
  if (!whole) return '—';
  const value = (part / whole) * 100;
  return `${value >= 10 || value === 0 ? value.toFixed(0) : value.toFixed(1)} %`;
}

export const NUMBER = new Intl.NumberFormat('es-PE');
